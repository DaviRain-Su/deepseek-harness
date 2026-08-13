/**
 * Live TUI session: one Agent, one pi-tui tree, slash commands, and questions.
 * @module @deepseek-ai/dsh-tui/app
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  Editor,
  ProcessTerminal,
  TuiMainScreen,
  matchesKey,
} from '@earendil-works/pi-tui'
import type { Terminal, TUI } from '@earendil-works/pi-tui'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { parseCommand } from '@deepseek-ai/dsh-commands'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { SlashAutocomplete } from './autocomplete.ts'
import { SessionFooter, SessionHeader } from './chrome.ts'
import { createQuestionProvider } from './questions.ts'
import { TUI_EDITOR_THEME } from './theme.ts'
import { TranscriptView } from './transcript.ts'

/** Process-facing effects of one TUI run. */
export interface TuiIo {
  stderr: { write(chunk: string): unknown }
  /** Request process exit with `code` after the tree disposes. */
  exit(code: number): void
}

/** Test and production hooks for TTY construction. */
export const internals: {
  stderr: TuiIo['stderr']
  /** Whether stdin is a TTY. Tests replace this. */
  isTTY: () => boolean
  /** Construct the pi-tui terminal. Tests replace this with a fake. */
  createTerminal: () => Terminal
  /** Called after the TUI starts and the Agent is live. */
  onReady: (app: TuiApp) => void
} = {
  stderr: process.stderr,
  isTTY: () => process.stdin.isTTY,
  createTerminal: () => new ProcessTerminal(),
  onReady: () => {},
}

/**
 * Drive one interactive terminal session against a live Agent.
 */
export class TuiApp {
  private readonly abort = new AbortController()
  private handle: AgentHandle | undefined
  private agent: Agent | undefined
  private tui: TUI | undefined
  private terminal: Terminal | undefined
  private readonly transcript = new TranscriptView(name => this.ctx.get('tools')?.get(name, this.agent))
  private readonly footer = new SessionFooter(process.cwd(), '')
  private stopped = false
  private exited = false

  /**
   * @param ctx - plugin context carrying core services and the launcher exit hook.
   * @param resume - persisted session id; empty creates a fresh session.
   * @param io - process-facing effects.
   */
  constructor(
    private readonly ctx: Context,
    private readonly resume: string,
    private readonly io: TuiIo,
  ) {}

  /**
   * Settle the Loader, create or resume the Agent, and start the TUI.
   */
  async start(): Promise<void> {
    await this.ctx.get('loader')?.await()
    const agents = this.ctx.get('agents')
    const defaultModel = this.ctx.get('agentDefaultModel')
    const sessions = this.ctx.get('sessions')
    const commands = this.ctx.get('commands')
    const userQuestions = this.ctx.get('userQuestions')
    if (
      this.abort.signal.aborted
      || agents === undefined
      || defaultModel === undefined
      || sessions === undefined
      || commands === undefined
      || userQuestions === undefined
    ) return

    const selection = defaultModel.currentSelection()
    const setup = (agentCtx: Context): void => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
    }
    const agentOptions = { provider: selection.provider, model: selection.model }
    this.handle = this.resume === ''
      ? await agents.create({
        sessionId: SessionId(`session-${randomUUID()}`),
        meta: { cwd: process.cwd() },
        agentOptions,
        setup,
      })
      : await agents.resume({
        resumeSessionId: SessionId(this.resume),
        agentOptions,
        setup,
      })
    await this.abandonIfStopped()
    if (this.stopped) return
    this.agent = this.handle.agent
    await this.agent.whenIdle()

    const terminal = internals.createTerminal()
    this.terminal = terminal
    const tui: TUI = new TuiMainScreen(terminal)
    this.tui = tui
    const agent = this.agent
    this.footer.setModel(`${selection.provider} / ${selection.model}`)
    tui.addChild(new SessionHeader(agent.id))
    tui.addChild(this.transcript.container)
    for (const event of agent.session.events) this.applyEvent(event, true)

    const editor = new Editor(tui, TUI_EDITOR_THEME)
    editor.setAutocompleteProvider(new SlashAutocomplete(this.listSlashCommands))
    editor.onSubmit = this.enqueueSubmit
    tui.addChild(editor)
    tui.addChild(this.footer)
    tui.setFocus(editor)
    tui.addInputListener((data: string) => {
      if (matchesKey(data, 'ctrl+c')) {
        if (this.agent?.status === 'running') {
          this.agent.cancel({ kind: 'user' })
          this.footer.setBusy(false)
          tui.requestRender()
        } else void this.quit(0)
        return { consume: true }
      }
      if (matchesKey(data, 'ctrl+d')) {
        void this.quit(0)
        return { consume: true }
      }
      return undefined
    })

    commands.register({
      name: 'help',
      description: 'List slash commands',
      handler: ({ agent }) => ({
        kind: 'success' as const,
        text: commands.list(agent).map(command => `/${command.name}  ${command.description}`).join('\n'),
      }),
    })
    commands.register({
      name: 'exit',
      description: 'Exit the terminal UI',
      handler: () => ({ kind: 'success' as const, text: '' }),
    })
    commands.register({
      name: 'quit',
      description: 'Exit the terminal UI',
      handler: () => ({ kind: 'success' as const, text: '' }),
    })
    userQuestions.registerProvider(createQuestionProvider(tui))
    this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
      if (session !== this.agent?.session) return
      this.applyEvent(event, false)
    })

    tui.start()
    internals.onReady(this)
  }

  /**
   * Forward an editor submit into {@link submit}.
   * @param text - the editor contents.
   */
  private readonly enqueueSubmit = (text: string): void => {
    void this.submit(text)
  }

  /**
   * Live slash catalog for the editor autocomplete provider.
   * @returns the current agent's command descriptors, or none if the session is gone.
   */
  private readonly listSlashCommands = (): readonly CommandDescriptor[] => {
    const agent = this.agent
    const commands = this.ctx.get('commands')
    if (agent === undefined || commands === undefined) return []
    return commands.list(agent)
  }

  /**
   * Drop a just-created Agent when the fiber stopped during create/resume.
   * @returns whether start should return without opening the TUI.
   */
  private async abandonIfStopped(): Promise<boolean> {
    if (!this.stopped) return false
    await this.disposeHandle()
    return true
  }

  /**
   * Dispose the in-flight Agent handle after an abort during create/resume.
   */
  private async disposeHandle(): Promise<void> {
    const handle = this.handle
    this.handle = undefined
    if (handle === undefined) return
    await handle.dispose()
  }

  /**
   * Handle one submitted editor line: slash commands stay in the command plane.
   * @param raw - the exact editor contents.
   */
  async submit(raw: string): Promise<void> {
    const line = raw.trim()
    const agent = this.agent
    const commands = this.ctx.get('commands')
    if (line === '' || agent === undefined || commands === undefined || this.stopped) return
    if (line.startsWith('/')) {
      const parsed = parseCommand(line)
      if (parsed === undefined) {
        this.notice(`unknown command: ${line}`)
        return
      }
      try {
        const execution = await commands.execute(agent, line, this.abort.signal)
        if (execution === undefined) {
          this.notice(`unknown command: /${parsed.name}`)
          return
        }
        if (execution.result.kind === 'error') this.notice(execution.result.text)
        else if (execution.result.text !== undefined && execution.result.text !== '') {
          this.notice(execution.result.text)
        }
        if (parsed.name === 'exit' || parsed.name === 'quit') await this.quit(0)
      } catch (error: unknown) {
        this.notice(`command error: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    this.footer.setBusy(true)
    this.tui?.requestRender()
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: line }],
      source: { kind: 'user' },
    }))
  }

  /**
   * Stop the TUI, drain input, and request process exit.
   * @param code - process exit code.
   */
  async quit(code: number): Promise<void> {
    this.stop()
    if (this.exited) return
    this.exited = true
    await this.terminal?.drainInput()
    const agent = this.agent
    if (agent !== undefined) await this.ctx.get('sessions')?.flush(agent.session)
    this.io.exit(code)
  }

  /** Restore the terminal without requesting process exit (fiber disposal). */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.abort.abort()
    this.tui?.stop()
    this.tui = undefined
  }

  /**
   * Append a notice line that is not a session event.
   * @param text - the notice body.
   */
  notice(text: string): void {
    this.transcript.notice(text)
    this.tui?.requestRender()
  }

  /**
   * Fold one session event into the transcript.
   * @param event - the durable event.
   * @param replay - historical events skip chunks and keep assembled messages.
   */
  applyEvent(event: SessionEvent, replay: boolean): void {
    if (event.type === 'turn/end') this.footer.setBusy(false)
    this.transcript.applyEvent(event, replay)
    this.tui?.requestRender()
  }
}
