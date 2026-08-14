/** Interactive runtime: TTY checks, create/resume, submit, slash commands, teardown. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox, emitAgentEvent } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, AgentStatus, CreateAgentOptions, ResumeAgentOptions } from '@deepseek-ai/dsh-agent'
import AgentDefaultModelConfig from '@deepseek-ai/dsh-agent-default-model'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { CallId, createAssistantMessage, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, UserMessage } from '@deepseek-ai/dsh-session'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { ProcessTerminal } from '@oh-my-pi/pi-tui'
import { apply, Config, internals, TuiApp } from '../src/index.ts'
import { applyTuiTheme, currentTuiThemeId } from '../src/theme.ts'
import { FakeTerminal } from './fake-terminal.ts'

const originalInternals = { ...internals }
afterEach(() => {
  Object.assign(internals, originalInternals)
  applyTuiTheme('dark')
})

interface Script {
  before?(session: Session): void
  afterPrompt?(session: Session, message: UserMessage): Promise<void> | void
}

function appendAssistant(session: Session, message: UserMessage, text: string): void {
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('user/message', message, { surfaceOp: 'append' })
  session.append('assistant/chunk', {
    turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text },
  })
  session.append('assistant/chunk', {
    turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '!' },
  })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text }],
      source: { provider: 'test-provider', model: 'test-model' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
}

/** Mount the real registries around a scripted Agent factory and a fake TTY. */
async function bench(script: Script = {}): Promise<{
  ctx: Context
  fake: FakeTerminal
  run(resume?: string): Promise<{ app: TuiApp; code: Promise<number>; err: string }>
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ApprovalService)
  await ctx.plugin(AgentDefaultModelConfig, { provider: 'test-provider', model: 'test-model' })
  const createAgent = async (
    ownerCtx: Context,
    options: CreateAgentOptions,
  ): Promise<AgentHandle> => {
    const session = ctx.sessions.create(options.sessionId, {
      ...options.meta === undefined ? {} : { meta: options.meta },
    })
    let idle = Promise.resolve()
    let status: AgentStatus = 'idle'
    const agent = {} as Agent
    const agentCtx = ownerCtx.extend({ agent })
    Object.assign(agent, {
      id: session.id,
      options: options.agentOptions ?? {},
      session,
      inbox: new Inbox(session, {
        inserted: (message) => { emitAgentEvent(ownerCtx, agent, 'agent/inbox/inserted', { message }) },
        discarded: (message) => { emitAgentEvent(ownerCtx, agent, 'agent/inbox/discarded', { message }) },
        claimed: (message, turn) => { emitAgentEvent(ownerCtx, agent, 'agent/inbox/claimed', { message, turn }) },
      }),
      ctx: agentCtx,
      cancel: () => {
        agent.inbox.clear()
        status = 'idle'
      },
      runMaintenance: () => Promise.reject(new Error('not used')),
      send: () => {},
      followup: (message: UserMessage) => {
        agent.inbox.append('next-turn', message)
        status = 'running'
        idle = (async () => {
          try {
            await script.afterPrompt?.(session, message)
          } finally {
            status = 'idle'
          }
        })()
      },
      steer: (message: UserMessage) => {
        agent.inbox.append('next-step', message)
      },
      inject: () => {},
      whenIdle: () => idle,
    } satisfies Partial<Agent>)
    // Object.assign copies getter values; keep status as a live accessor.
    Object.defineProperty(agent, 'status', {
      configurable: true,
      enumerable: true,
      get: () => status,
      set: (value: AgentStatus) => { status = value },
    })
    await options.setup?.(agentCtx)
    script.before?.(session)
    ctx.agents.register(agent)
    return { agent, dispose: () => Promise.resolve() }
  }
  ctx.agents.setFactory({
    createAgent,
    resume: (ownerCtx: Context, options: ResumeAgentOptions) => createAgent(ownerCtx, {
      sessionId: options.resumeSessionId,
      ...options.agentOptions === undefined ? {} : { agentOptions: options.agentOptions },
      ...options.setup === undefined ? {} : { setup: options.setup },
      ...options.signal === undefined ? {} : { signal: options.signal },
    }),
  })
  const fake = new FakeTerminal()
  return {
    ctx,
    fake,
    run: async (resume = '') => {
      let err = ''
      internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
      internals.isTTY = () => true
      internals.createTerminal = () => fake
      const exited = new Promise<number>((resolve) => {
        ctx.provide('appExit', (code: number) => { resolve(code) })
      })
      const ready = new Promise<TuiApp>((resolve) => {
        internals.onReady = resolve
      })
      apply(ctx, new Config({ resume }))
      return { app: await ready, code: exited, err }
    },
  }
}

describe('tui runtime', () => {
  it('fails loud without the launcher-provided exit request', () => {
    const ctx = new Context()
    expect(() => { apply(ctx, new Config({ resume: '' })) }).toThrow('must provide ctx.appExit')
  })

  it('rejects a non-TTY stdin', () => {
    const ctx = new Context()
    let err = ''
    let code: number | undefined
    internals.isTTY = () => false
    internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
    ctx.provide('appExit', (value: number) => { code = value })
    apply(ctx, new Config({ resume: '' }))
    expect(err).toContain('interactive TTY')
    expect(code).toBe(1)
  })

  it('constructs ProcessTerminal by default and validates config', () => {
    expect(internals.createTerminal()).toBeInstanceOf(ProcessTerminal)
    originalInternals.isTTY()
    originalInternals.onReady({} as TuiApp)
    expect(new Config({} as never)).toEqual({ resume: '', theme: 'dark' })
    expect(new Config({ resume: 'abc' })).toEqual({ resume: 'abc', theme: 'dark' })
  })

  it('does not default-export the plugin namespace', async () => {
    const mod = await import('../src/index.ts')
    expect('default' in mod).toBe(false)
  })

  it('starts a new session, submits a prompt, and quits', async () => {
    const test = await bench({
      afterPrompt(session, message) { appendAssistant(session, message, 'hello') },
    })
    const { app, code } = await test.run()
    expect(test.fake.isStarted).toBe(true)
    await app.submit('   ')
    await app.submit('hello')
    const answered = app['transcript'].container.render(80).join('\n')
    expect(answered).toContain('hello')
    expect(answered).not.toContain('⠋')
    await app.submit('/unknown-cmd')
    await app.submit('/Nope')
    await app.submit('/help')
    test.ctx.commands.register({
      name: 'boom',
      description: 'throw',
      handler: () => { throw new Error('nope') },
    })
    test.ctx.commands.register({
      name: 'boom-text',
      description: 'throw text',
      handler: () => { throw 'nope' },
    })
    test.ctx.commands.register({
      name: 'bad',
      description: 'error result',
      handler: () => ({ kind: 'error', text: 'bad' }),
    })
    await app.submit('/boom')
    await app.submit('/boom-text')
    await app.submit('/bad')
    app['enqueueSubmit']('from-editor')
    expect(app['listSlashCommands']().some((command: { name: string }) => command.name === 'help')).toBe(true)
    expect(await app['listSlashSkills']()).toEqual([])
    test.ctx.sessions.create(SessionId('other')).append('turn/start', { turn: 1 })
    await app.quit(0)
    expect(await code).toBe(0)
    expect(test.fake.isStarted).toBe(false)
    await test.ctx.fiber.dispose()
  })

  it('renders subagent lifecycle cards, child activity, and the running count', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    expect(test.fake.title).toBe('dsh')
    expect(test.fake.progress).toBe(false)
    const childId = SessionId('child-sub')
    test.ctx.emit('subagent/start', {
      runId: 'run-1', provider: 'in-process', id: childId, local: true,
    } as never)
    expect(app['footer'].render(80)[1]).toContain('1 subagent running')
    expect(test.fake.title).toBe('dsh · 1 subagent running')
    expect(test.fake.progress).toBe(true)
    const child = test.ctx.sessions.create(childId)
    child.append('subagent/descriptor', {
      version: 2, mode: 'one-shot', provider: 'in-process', label: '调查任务',
    })
    child.append('tool/call', {
      turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{}',
    })
    test.ctx.emit('subagent/end', {
      runId: 'run-1', provider: 'in-process', id: childId, local: true, stopReason: 'completed',
    } as never)
    expect(app['footer'].render(80)[1]).not.toContain('subagent')
    expect(test.fake.title).toBe('dsh')
    expect(test.fake.progress).toBe(false)
    expect(test.fake.output).toContain('\a')
    const text = app['transcript'].container.render(80).join('\n')
    expect(text).toContain('⏵ 调查任务 — completed')
    expect(text).toContain('● bash')
    expect(text).toContain('1 tool call · completed')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('resumes a persisted session and replays assembled messages', async () => {
    const test = await bench({
      before(session) {
        const setup = createUserMessage({
          content: [{ type: 'text', text: 'earlier' }],
          source: { kind: 'user' },
        })
        session.append('turn/start', { turn: 1 })
        session.append('step/start', { turn: 1, step: 1 })
        session.append('user/message', setup, { surfaceOp: 'append' })
        session.append('assistant/message', {
          turn: 1,
          step: 1,
          message: createAssistantMessage({
            content: [{ type: 'text', text: 'prior' }],
            source: { provider: 'test-provider', model: 'test-model' },
          }),
        }, { surfaceOp: 'append' })
        session.append('step/end', { turn: 1, step: 1 })
        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      },
    })
    const { app, code } = await test.run('session-resume')
    expect(app['agent']!.id).toBe('session-resume')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('exits through /exit and /quit after dispatch', async () => {
    const test = await bench()
    const first = await test.run()
    await first.app.submit('/exit')
    expect(await first.code).toBe(0)
    await test.ctx.fiber.dispose()

    const again = await bench()
    const second = await again.run()
    await second.app.submit('/quit')
    expect(await second.code).toBe(0)
    await again.ctx.fiber.dispose()
  })

  it('cancels a running agent on ctrl+c and quits when idle', async () => {
    let cancelled = false
    const test = await bench()
    const { app, code } = await test.run()
    const agent = app['agent'] as Agent & { status: AgentStatus }
    agent.status = 'running'
    agent.cancel = () => { cancelled = true; agent.status = 'idle' }
    test.fake.type('\x03')
    expect(cancelled).toBe(true)
    test.fake.type('\x03')
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('steers typed input into a running turn and paints a pending row', async () => {
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => { release = resolve })
    const test = await bench({
      afterPrompt: () => held,
    })
    const { app, code } = await test.run()
    const agent = app['agent'] as Agent
    await app.submit('first')
    expect(agent.status).toBe('running')
    expect(agent.inbox.nextTurn).toHaveLength(1)
    const waiting = app['transcript'].container.render(80).join('\n')
    expect(waiting).toContain('first')
    expect(waiting).toContain('Thinking')
    expect(waiting).toContain('⠋')
    expect(test.fake.progress).toBe(true)
    expect(waiting).not.toContain('queued')
    await app.submit('keep going')
    expect(agent.inbox.nextStep).toHaveLength(1)
    expect(agent.inbox.nextStep[0]?.content).toEqual([{ type: 'text', text: 'keep going' }])
    const pending = app['transcript'].container.render(80).join('\n')
    expect(pending).toContain('appending')
    expect(pending).toContain('keep going')
    agent.inbox.claim('next-step', 1)
    expect(app['transcript'].container.render(80).join('\n')).not.toContain('appending')
    agent.inbox.append('next-turn', createUserMessage({
      content: [{ type: 'text', text: 'queued later' }],
      source: { kind: 'user' },
    }))
    const queued = app['transcript'].container.render(80).join('\n')
    expect(queued).toContain('queued')
    expect(queued).toContain('queued later')
    test.fake.type('\x03')
    expect(app['transcript'].container.render(80).join('\n')).not.toContain('queued later')
    expect(app['transcript'].container.render(80).join('\n')).not.toContain('⠋')
    expect(test.fake.progress).toBe(false)
    release?.()
    await agent.whenIdle()
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('hides the Thinking loader on the first streamed token', async () => {
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => { release = resolve })
    const test = await bench({
      afterPrompt: () => held,
    })
    const { app, code } = await test.run()
    await app.submit('ask')
    expect(app['transcript'].container.render(80).join('\n')).toContain('⠋')
    app.applyEvent({
      type: 'assistant/chunk', seq: 1, time: 0,
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Hi' } },
    } as never, false)
    const live = app['transcript'].container.render(80).join('\n')
    expect(live).toContain('Hi')
    expect(live).not.toContain('⠋')
    expect(live).not.toContain('Thinking')
    release?.()
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('quits on ctrl+d', async () => {
    const test = await bench()
    const { code } = await test.run()
    test.fake.type('\x04')
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('reports a direct Agent creation failure', async () => {
    const ctx = new Context()
    let err = ''
    internals.isTTY = () => true
    internals.createTerminal = () => new FakeTerminal()
    internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
    const exited = new Promise<number>((resolve) => {
      ctx.provide('appExit', resolve)
    })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
    ctx.provide('sessions', { flush: () => Promise.resolve(true) } as never)
    ctx.provide('commands', { register: () => () => {}, list: () => [], execute: () => Promise.resolve(undefined) } as never)
    ctx.provide('userQuestions', { registerProvider: () => () => {} } as never)
    ctx.provide('agents', { create: () => Promise.reject(new Error('factory exploded')) } as never)
    apply(ctx, new Config({ resume: '' }))
    expect(await exited).toBe(1)
    expect(err).toBe('dsh: factory exploded\n')
    await ctx.fiber.dispose()
  })

  it('stringifies a non-Error Agent creation failure', async () => {
    const ctx = new Context()
    let err = ''
    internals.isTTY = () => true
    internals.createTerminal = () => new FakeTerminal()
    internals.stderr = { write: (chunk: string) => { err += chunk; return true } }
    const exited = new Promise<number>((resolve) => {
      ctx.provide('appExit', resolve)
    })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
    ctx.provide('sessions', { flush: () => Promise.resolve(true) } as never)
    ctx.provide('commands', { register: () => () => {}, list: () => [], execute: () => Promise.resolve(undefined) } as never)
    ctx.provide('userQuestions', { registerProvider: () => () => {} } as never)
    const rejected = {
      then(_resolve: (value: never) => void, reject: (reason: unknown) => void): void {
        reject('factory exploded')
      },
    }
    ctx.provide('agents', { create: () => rejected } as never)
    apply(ctx, new Config({ resume: '' }))
    expect(await exited).toBe(1)
    expect(err).toBe('dsh: factory exploded\n')
    await ctx.fiber.dispose()
  })

  it('abandons a run when the tree is disposed during Loader settlement', async () => {
    const ctx = new Context()
    let exited = false
    internals.isTTY = () => true
    internals.stderr = { write: () => true }
    ctx.provide('appExit', () => { exited = true })
    const services = ctx.plugin((child: Context) => {
      child.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
      child.provide('sessions', {} as never)
      child.provide('agents', {} as never)
      child.provide('commands', {} as never)
      child.provide('userQuestions', {} as never)
    })
    await services
    let release: (() => void) | undefined
    const settlement = new Promise<void>((resolve) => { release = resolve })
    ctx.provide('loader', { await: () => settlement } as never)
    apply(ctx, new Config({ resume: '' }))
    await services.dispose()
    release?.()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(exited).toBe(false)
    await ctx.fiber.dispose()
  })

  it('ignores non-control keys, skipped events, and submit after quit', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    test.fake.type('x')
    test.fake.resize()
    app.applyEvent({ type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } as never, false)
    app.applyEvent({
      type: 'assistant/chunk', seq: 2, time: 0,
      data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '' } },
    } as never, false)
    app.applyEvent({
      type: 'tool/call', seq: 3, time: 0,
      data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}' },
    } as never, false)
    app['agent'] = undefined
    expect(app['listSlashCommands']()).toEqual([])
    expect(await app['listSlashSkills']()).toEqual([])
    await app.quit(0)
    await app.submit('late')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('stops the TUI on fiber disposal without requesting exit', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    expect(test.fake.isStarted).toBe(true)
    await test.ctx.fiber.dispose()
    expect(test.fake.isStarted).toBe(false)
    const winner = await Promise.race([
      code.then(() => 'exited' as const),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => { resolve('pending') }, 20)
      }),
    ])
    expect(winner).toBe('pending')
    void app
  })

  it('disposes a created agent when aborted before the TUI starts', async () => {
    let disposed = false
    const ctx = new Context()
    internals.isTTY = () => true
    internals.createTerminal = () => new FakeTerminal()
    const app = new TuiApp(ctx, '', { stderr: { write: () => true }, exit: () => {} })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
    ctx.provide('sessions', { flush: () => Promise.resolve(true) } as never)
    ctx.provide('commands', { register: () => () => {}, list: () => [] } as never)
    ctx.provide('userQuestions', { registerProvider: () => () => {} } as never)
    ctx.provide('agents', {
      create: async () => {
        app.stop()
        return {
          agent: { id: 'late', session: { events: [], seq: 0 }, whenIdle: () => Promise.resolve(), status: 'idle' },
          dispose: async () => { disposed = true },
        }
      },
    } as never)
    await app.start()
    expect(disposed).toBe(true)
    await app['disposeHandle']()
    await ctx.fiber.dispose()
  })

  it('pins the editor and footer to the bottom of an empty viewport', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    const tui = app['tui']!
    const width = test.fake.columns
    const frame = [...tui.render(width)]
    expect(frame).toHaveLength(test.fake.rows)
    expect(frame.slice(-2)).toEqual(app['footer'].render(width))
    expect(frame[0]).toContain('dsh')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('opens /model over ctx.llm, switches the live selection, and updates the footer', async () => {
    const test = await bench()
    test.ctx.provide('llm', {
      listProviders: () => [{ id: 'openai', name: 'openai' }, { id: 'test-provider', name: 'Test' }],
      listModels: async (provider: string) => provider === 'openai'
        ? [{ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }]
        : [{ provider: 'test-provider', id: 'test-model', name: 'Test Model' }],
    } as never)
    const { app, code } = await test.run()
    await app.openModelPicker()
    test.fake.type('\x1b[A')
    test.fake.type('\r')
    await Promise.resolve()
    expect(app['selection']?.current).toEqual({ provider: 'openai', model: 'gpt-4.1' })
    expect(app['footer'].render(80)[1]).toContain('openai / gpt-4.1')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('opens an effort picker after /model when the model exposes efforts, and persists the choice', async () => {
    const test = await bench()
    test.ctx.provide('llm', {
      listProviders: () => [{ id: 'openai', name: 'openai' }],
      listModels: async () => [{ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }],
      resolveModelInfo: async () => ({
        provider: 'openai',
        id: 'gpt-4.1',
        name: 'GPT 4.1',
        reasoning: {
          efforts: [
            { id: ReasoningEffortId('off'), name: 'Off' },
            { id: ReasoningEffortId('high'), name: 'High' },
            { id: ReasoningEffortId('max'), name: 'Max' },
          ],
          defaultEffort: ReasoningEffortId('high'),
        },
      }),
    } as never)
    const saved: { provider: string; model: string; reasoningEffort?: string }[] = []
    test.ctx.provide('settings', {
      register: () => ({ get: () => ({ provider: 'openai', model: 'gpt-4.1' }), watch: () => () => {} }),
      get: () => ({ provider: 'openai', model: 'gpt-4.1' }),
      replace: async (_ns: unknown, section: { provider: string; model: string; reasoningEffort?: string }) => {
        saved.push(section)
      },
    } as never)
    const { app, code } = await test.run()
    await app.openModelPicker()
    test.fake.type('\r')
    await Promise.resolve()
    // The effort picker is now open with the model default `high` preselected.
    test.fake.type('\r')
    await Promise.resolve()
    await Promise.resolve()
    expect(app['selection']?.current).toEqual({
      provider: 'openai', model: 'gpt-4.1', reasoningEffort: ReasoningEffortId('high'),
    })
    expect(app['footer'].render(80)[1]).toContain('openai / gpt-4.1 · high')
    expect(saved).toEqual([{ provider: 'openai', model: 'gpt-4.1', reasoningEffort: 'high' }])
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('cancels the whole /model switch when the effort picker is dismissed', async () => {
    const test = await bench()
    test.ctx.provide('llm', {
      listProviders: () => [{ id: 'openai', name: 'openai' }],
      listModels: async () => [{ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }],
      resolveModelInfo: async () => ({
        provider: 'openai',
        id: 'gpt-4.1',
        name: 'GPT 4.1',
        reasoning: {
          efforts: [
            { id: ReasoningEffortId('off'), name: 'Off' },
            { id: ReasoningEffortId('high'), name: 'High' },
          ],
          defaultEffort: ReasoningEffortId('high'),
        },
      }),
    } as never)
    const saved: unknown[] = []
    test.ctx.provide('settings', {
      register: () => ({ get: () => ({ provider: 'openai', model: 'gpt-4.1' }), watch: () => () => {} }),
      get: () => ({ provider: 'openai', model: 'gpt-4.1' }),
      replace: async (_ns: unknown, section: unknown) => { saved.push(section) },
    } as never)
    const { app, code } = await test.run()
    await app.openModelPicker()
    test.fake.type('\r')
    await Promise.resolve()
    // Effort picker open; escape cancels the whole switch.
    test.fake.type('\x1b')
    await Promise.resolve()
    expect(app['selection']?.current).toEqual({ provider: 'openai', model: 'gpt-4.1' })
    expect(app['footer'].render(80)[1]).toContain('openai / gpt-4.1')
    expect(saved).toEqual([])
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('rebuilds an open /model picker when llm adapters update', async () => {
    const test = await bench()
    let providers = [{ id: 'openai', name: 'openai' }]
    test.ctx.provide('llm', {
      listProviders: () => providers,
      listModels: async (provider: string) => provider === 'openai-codex'
        ? [{ provider: 'openai-codex', id: 'gpt-5', name: 'GPT 5' }]
        : [{ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }],
    } as never)
    const { app, code } = await test.run()
    await app.openModelPicker()
    providers = [
      { id: 'openai', name: 'openai' },
      { id: 'openai-codex', name: 'Codex' },
    ]
    await app['onAdaptersUpdated']()
    expect(app['listingModels']).toBe(true)
    expect(app['overlay']).toBeDefined()
    test.fake.type('\x1b[B')
    test.fake.type('\r')
    await Promise.resolve()
    expect(app['selection']?.current).toEqual({ provider: 'openai-codex', model: 'gpt-5' })
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('notices a newly registered provider when /model is closed', async () => {
    const test = await bench()
    let providers = [{ id: 'openai', name: 'openai' }]
    test.ctx.provide('llm', {
      listProviders: () => providers,
      listModels: async () => [{ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }],
    } as never)
    const { app, code } = await test.run()
    providers = [
      { id: 'openai', name: 'openai' },
      { id: 'openai-codex', name: 'Codex' },
    ]
    test.ctx.emit('llm/adapters-updated')
    await Promise.resolve()
    const text = app['transcript'].container.render(80).join('\n')
    expect(text).toContain('openai-codex available — /model')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('notices when the current model provider disappears', async () => {
    const test = await bench()
    let providers = [{ id: 'openai', name: 'openai' }, { id: 'test-provider', name: 'Test' }]
    test.ctx.provide('llm', {
      listProviders: () => providers,
      listModels: async () => [{ provider: 'test-provider', id: 'test-model', name: 'Test Model' }],
    } as never)
    const { app, code } = await test.run()
    providers = [{ id: 'openai', name: 'openai' }]
    test.ctx.emit('llm/adapters-updated')
    await Promise.resolve()
    const text = app['transcript'].container.render(80).join('\n')
    expect(text).toContain('test-provider is no longer available')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('skips the effort picker and keeps the footer clean for a non-reasoning model', async () => {
    const test = await bench()
    test.ctx.provide('llm', {
      listProviders: () => [{ id: 'openai', name: 'openai' }],
      listModels: async () => [{ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }],
      resolveModelInfo: async () => ({ provider: 'openai', id: 'gpt-4.1', name: 'GPT 4.1' }),
    } as never)
    const { app, code } = await test.run()
    await app.openModelPicker()
    test.fake.type('\r')
    await Promise.resolve()
    await Promise.resolve()
    expect(app['selection']?.current).toEqual({ provider: 'openai', model: 'gpt-4.1' })
    expect(app['footer'].render(80)[1]).toContain('openai / gpt-4.1')
    expect(app['footer'].render(80)[1]).not.toContain('·')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('answers an in-turn approval through the Allow once overlay', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    const agent = app['agent']!
    agent.session.append('turn/start', { turn: 1 })
    const pending = test.ctx.approval.request({
      agent,
      toolName: 'bash',
      reason: 'escalate sandbox to workspace-write',
    })
    await Promise.resolve()
    expect(app['overlay']).toBeDefined()
    test.fake.type('\r')
    await expect(pending).resolves.toBe('allowed-once')
    expect(app['overlay']).toBeUndefined()
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('notices a missing subscription store on /login and /auth', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    await app.submit('/login')
    await app.submit('/auth')
    const text = app['transcript'].container.render(80).join('\n')
    expect(text).toContain('subscription login is not mounted')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('opens /login, runs the selected provider, and notices success', async () => {
    const test = await bench()
    const logged: string[] = []
    test.ctx.provide('llmOAuth', {
      loginableProviders: () => [
        { id: 'openai-codex', name: 'OpenAI Codex', loginLabel: 'ChatGPT Plus' },
        { id: 'anthropic', name: 'Anthropic' },
      ],
      list: async () => [],
      login: async (provider: string) => {
        logged.push(provider)
        return { type: 'oauth', access: 'x' }
      },
      logout: async () => {},
    } as never)
    const { app, code } = await test.run()
    await app.submit('/login')
    expect(app['overlay']).toBeDefined()
    test.fake.type('\r')
    await Promise.resolve()
    await Promise.resolve()
    expect(logged).toEqual(['openai-codex'])
    expect(app['transcript'].container.render(80).join('\n')).toContain('logged in to openai-codex')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('logs in a named provider, shows /auth status, and logs out', async () => {
    const test = await bench()
    let stored: { providerId: string }[] = []
    test.ctx.provide('llmOAuth', {
      loginableProviders: () => [
        { id: 'openai-codex', name: 'OpenAI Codex' },
        { id: 'anthropic', name: 'Anthropic' },
      ],
      list: async () => stored,
      login: async (provider: string) => {
        stored = [{ providerId: provider }]
        return { type: 'oauth', access: 'x' }
      },
      logout: async (provider: string) => {
        stored = stored.filter(entry => entry.providerId !== provider)
      },
    } as never)
    const { app, code } = await test.run()
    await app.submit('/login openai-codex')
    await Promise.resolve()
    await Promise.resolve()
    await app.submit('/auth')
    expect(app['transcript'].container.render(80).join('\n')).toContain('openai-codex logged in')
    await app.submit('/logout')
    expect(app['overlay']).toBeDefined()
    test.fake.type('\r')
    await Promise.resolve()
    await Promise.resolve()
    expect(app['transcript'].container.render(80).join('\n')).toContain('logged out of openai-codex')
    await app.submit('/logout')
    expect(app['transcript'].container.render(80).join('\n')).toContain('no subscription logins')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('notices a missing session-query service on /sessions', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    await app.submit('/sessions')
    expect(app['transcript'].container.render(80).join('\n')).toContain('session listing is not mounted')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('opens /sessions and keeps the current row without switching', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    const current = app['agent']!.id
    test.ctx.provide('sessionQuery', {
      filterSessions: async () => [{
        header: { version: 0, id: current, createdAt: 1, cwd: process.cwd() },
        live: true,
        persisted: true,
      }],
      readTitleSnapshots: async () => [{
        sessionId: current,
        status: 'fulfilled',
        value: { session: { version: 0, id: current, createdAt: 1 }, title: { title: 'Current' } },
      }],
    } as never)
    await app.submit('/sessions')
    expect(app['overlay']).toBeDefined()
    test.fake.type('\r')
    await Promise.resolve()
    await Promise.resolve()
    expect(app['agent']!.id).toBe(current)
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('switches to a named session and refuses while a turn is running', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    const current = app['agent']!
    current.status = 'running'
    await app.submit('/sessions session-other')
    expect(app['transcript'].container.render(80).join('\n'))
      .toContain('finish the current turn before switching sessions')
    expect(app['agent']!.id).toBe(current.id)
    current.status = 'idle'
    await app.submit('/sessions session-other')
    await Promise.resolve()
    await Promise.resolve()
    expect(app['agent']!.id).toBe('session-other')
    expect(app['sessionHeader']!.render(80).join('\n')).toContain('session session-other')
    expect(app['transcript'].container.render(80).join('\n')).toContain('session session-other')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('lists user-invocable skills for slash autocomplete and swallows catalog failures', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    expect(await app['listSlashSkills']()).toEqual([])
    let listed: unknown = [
      {
        name: 'review',
        description: 'Review the change',
        invocation: { modelInvocable: true, userInvocable: true },
      },
      {
        name: 'hidden',
        description: 'Model only',
        invocation: { modelInvocable: true, userInvocable: false },
      },
    ]
    const session = app['agent']!.session
    const header = { ...session.header, cwd: '/workspace/cache' }
    Object.defineProperty(session, 'header', { configurable: true, value: header })
    test.ctx.provide('skills', {
      list: async (options: { cwd?: string; scope?: unknown }) => {
        expect(options.cwd).toBe(app['agent'] === undefined ? undefined : '/workspace/cache')
        expect(options.scope).toBe(app['agent'])
        if (listed instanceof Error) throw listed
        return listed
      },
    } as never)
    expect(await app['listSlashSkills']()).toEqual([
      { name: 'review', description: 'Review the change' },
    ])
    listed = new Error('catalog down')
    expect(await app['listSlashSkills']()).toEqual([])
    app['agent'] = undefined
    listed = [{
      name: 'review',
      description: 'Review the change',
      invocation: { modelInvocable: true, userInvocable: true },
    }]
    expect(await app['listSlashSkills']()).toEqual([
      { name: 'review', description: 'Review the change' },
    ])
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('notices a missing LLM runtime and an empty catalog, and ignores a second overlay', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    await app.submit('/model')
    test.ctx.provide('llm', {
      listProviders: () => [],
      listModels: async () => [],
    } as never)
    await app.openModelPicker()
    app.openThemePicker()
    app.openThemePicker()
    test.fake.type('\x1b')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('shows durable token/context stats in the footer from session projections', async () => {
    const test = await bench()
    type Listener = (session: Session, key: string, value: unknown, seq: number) => void
    let listener: Listener | undefined
    let values: Record<string, unknown> = {}
    test.ctx.provide('sessionProjections', {
      snapshot: () => ({ asOfSeq: 0, values }),
      onChanged: (next: Listener) => { listener = next; return () => { listener = undefined } },
    } as never)
    const { app, code } = await test.run()
    // No token activity yet: footer stays two rows.
    expect(app['footer'].render(80)).toHaveLength(2)
    // A billed turn lands: the projection snapshot now carries usage + pressure + stats.
    values = {
      tokenUsage: { uncachedInputTokens: 100, outputTokens: 3_000, cacheReadTokens: 900, cacheWriteTokens: 0 },
      contextPressure: { projectedTokens: 48_000, contextWindow: 128_000 },
      sessionStats: { turns: 3, steps: 3, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 1_500, decodeTokens: 3_000 },
    }
    const session = app['agent']!.session
    listener!(session, 'tokenUsage', values['tokenUsage'], 1)
    await Promise.resolve()
    const rows = app['footer'].render(80)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('cache 90%')
    expect(rows[1]).toContain('ctx 38% 48K/128K')
    expect(rows[1]).toContain('3 turns')
    // A change for a different session is ignored.
    listener!({} as Session, 'tokenUsage', undefined, 2)
    await Promise.resolve()
    expect(app['footer'].render(80)[1]).toContain('cache 90%')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('applies /theme and ctrl+p, then restores the dark palette', async () => {
    const test = await bench()
    test.ctx.provide('llm', {
      listProviders: () => [{ id: 'test-provider', name: 'Test' }],
      listModels: async () => [{ provider: 'test-provider', id: 'test-model', name: 'Test Model' }],
    } as never)
    const { app, code } = await test.run()
    await app.submit('/theme')
    test.fake.type('\r')
    test.fake.type('\x10')
    await Promise.resolve()
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('restores a saved /theme id and persists the next pick', async () => {
    const test = await bench()
    const stored = { theme: 'light' }
    const replaced: object[] = []
    test.ctx.provide('settings', {
      register: () => ({
        get: () => stored,
        watch: () => () => {},
      }),
      get: () => stored,
      replace: async (_ns: unknown, section: object) => {
        replaced.push(section)
        Object.assign(stored, section)
      },
    } as never)
    const { app, code } = await test.run()
    expect(currentTuiThemeId()).toBe('light')
    await app.submit('/theme')
    test.fake.type('\x1b[A')
    test.fake.type('\r')
    await Promise.resolve()
    await Promise.resolve()
    expect(currentTuiThemeId()).toBe('dark-catppuccin')
    expect(replaced).toEqual([{ theme: 'dark-catppuccin' }])
    expect(app['transcript'].container.render(80).join('\n')).toContain('theme dark-catppuccin')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('notices an unknown saved /theme id and keeps the live palette', async () => {
    const test = await bench()
    test.ctx.provide('settings', {
      register: () => ({
        get: () => ({ theme: 'nope' }),
        watch: () => () => {},
      }),
      get: () => ({ theme: 'nope' }),
      replace: async () => {},
    } as never)
    const { app, code } = await test.run()
    expect(currentTuiThemeId()).toBe('dark')
    expect(app['transcript'].container.render(80).join('\n')).toContain('unknown theme: nope')
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
  })

  it('expands a diff card on ctrl+o and opens it fullscreen on alt+o', async () => {
    const test = await bench()
    const { app, code } = await test.run()
    test.ctx.provide('tools', {
      get: () => ({
        presentCall: () => ({
          card: 'diff',
          title: 'Edit a.ts',
          diffs: [{ path: 'a.ts', oldText: 'old', newText: 'new' }],
        }),
      }),
    } as never)
    app.applyEvent({
      type: 'tool/call',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{}' },
    } as never, false)
    test.fake.type('\x0f')
    expect(app['transcript'].container.render(80).join('\n')).toContain('- old')
    test.fake.type('\x1bo')
    test.fake.type('\x1b')
    app.openDiffOverlay()
    app.openDiffOverlay()
    test.fake.type('\x1b')
    const idle = await bench()
    const { app: idleApp } = await idle.run()
    idle.fake.type('\x1bo')
    await idleApp.quit(0)
    await app.quit(0)
    expect(await code).toBe(0)
    await test.ctx.fiber.dispose()
    await idle.ctx.fiber.dispose()
  })
})
