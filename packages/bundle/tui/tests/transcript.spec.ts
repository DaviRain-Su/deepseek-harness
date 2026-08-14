/** Pure transcript formatting and event assembly. */

import { describe, expect, it } from 'vitest'
import { visibleWidth } from '@oh-my-pi/pi-tui'
import { CallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { AssistantMessageBlock, PendingInputBlock, ThinkingBlock, UserMessageBlock } from '../src/messages.ts'
import { extractText, TranscriptView, wrapLine } from '../src/transcript.ts'

function event<T extends SessionEvent['type']>(
  type: T,
  data: SessionEvent<T>['data'],
): SessionEvent<T> {
  return { type, seq: 1, time: 0, data } as SessionEvent<T>
}

describe('wrapLine', () => {
  it('keeps empty input as one blank row and splits on width', () => {
    expect(wrapLine('', 10)).toEqual([''])
    expect(wrapLine('abcdef', 3)).toEqual(['abc', 'def'])
    expect(wrapLine('ab\n\ncd', 10)).toEqual(['ab', '', 'cd'])
    expect(wrapLine('hello', 0)).toEqual(['hello'])
    expect(wrapLine('', 0)).toEqual([''])
  })

  it('wraps CJK by display columns so a line cannot overflow the terminal', () => {
    expect(wrapLine('你好世界', 4)).toEqual(['你好', '世界'])
    const overflow = 'Assistant: 我是 DeepSeek Harness 的编码智能体（coding agent），基于 deepseek-v4-flash 模型。我的工作目录是 `/Users/davirian/orca/projects/deepseek-harness`，这是一个插件'
    for (const line of wrapLine(overflow, 161)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(161)
    }
    for (const line of wrapLine('你', 1)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(1)
    }
  })
})

describe('extractText', () => {
  it('joins visible blocks and skips reasoning', () => {
    expect(extractText([
      { type: 'text', text: 'hi' },
      { type: 'reasoning', text: 'secret' },
      { type: 'image', attachment: { id: 'img' } as never },
      { type: 'tool-call', id: CallId('c1'), name: 'bash', arguments: '{}' },
      { type: 'tool-result', toolCallId: CallId('c1'), content: [{ type: 'text', text: 'ok' }] },
    ])).toBe('hi[image]bash()ok')
    expect(extractText([{ type: 'unknown' } as never])).toBe('')
  })
})

describe('chat blocks', () => {
  it('paints a user bubble and streams assistant Markdown in place', () => {
    const user = new UserMessageBlock('hello')
    user.invalidate()
    const bubble = user.render(40)
    expect(bubble.some(line => line.includes('You'))).toBe(false)
    expect(bubble.some(line => line.includes('hello'))).toBe(true)
    expect(bubble.some(line => line.includes('\x1b[48;2;'))).toBe(true)
    for (const line of user.render(40)) expect(visibleWidth(line)).toBeLessThanOrEqual(40)
    const assistant = new AssistantMessageBlock('Hi')
    assistant.append(' there')
    assistant.settle()
    assistant.invalidate()
    expect(assistant.render(40).some(line => line.includes('Hi there'))).toBe(true)
    for (const line of new AssistantMessageBlock('你好世界').render(4)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(4)
    }
    const thinking = new ThinkingBlock('plan')
    thinking.append(' it')
    thinking.invalidate()
    const thought = thinking.render(40).join('\n')
    expect(thought).toContain('Thinking')
    expect(thought).toContain('plan it')
    expect(thought).toContain('\x1b[3m')
    for (const line of new ThinkingBlock('你好世界').render(4)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(4)
    }
    const pending = new PendingInputBlock('steering', 'keep going')
    pending.invalidate()
    const pendingText = pending.render(40).join('\n')
    expect(pendingText).toContain('appending')
    expect(pendingText).toContain('keep going')
    pending.dismiss()
    expect(pending.render(40)).toEqual([])
    expect(new PendingInputBlock('queued', 'next').render(40).join('\n')).toContain('queued')
    for (const line of new PendingInputBlock('steering', '你好世界').render(4)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(4)
    }
  })
})

describe('TranscriptView', () => {
  it('assembles user, streamed assistant, tools, notices, and replay', () => {
    const view = new TranscriptView(() => undefined)
    view.applyEvent(event('user/message', createUserMessage({
      content: [{ type: 'text', text: '' }],
      source: { kind: 'user' },
    })), false)
    view.applyEvent(event('user/message', createUserMessage({
      content: [{ type: 'text', text: 'hidden' }],
      source: { kind: 'plugin', plugin: 'x' },
    })), false)
    view.applyEvent(event('user/message', createUserMessage({
      content: [{ type: 'text', text: 'hello' }],
      source: { kind: 'user' },
    })), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '' },
    }), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    }), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Hi' },
    }), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '!' },
    }), false)
    view.applyEvent(event('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'Hi!' }],
        source: { provider: 'p', model: 'm' },
      }),
    }), false)
    view.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{}',
    }), false)
    view.applyEvent(event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('c1'), content: [{ type: 'text', text: 'ok' }], isError: false,
      }),
    }), false)
    view.applyEvent(event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('orphan'), content: [{ type: 'text', text: 'late' }], isError: true,
      }),
      error: { name: 'ToolError', code: 'X' },
    }), false)
    view.applyEvent(event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('orphan-ok'), content: [{ type: 'text', text: 'late-ok' }], isError: false,
      }),
    }), false)
    view.applyEvent(event('turn/start', { turn: 1 }), false)
    view.notice('note')
    const live = view.container.render(80).join('\n')
    expect(live).not.toContain('You')
    expect(live).toContain('hello')
    expect(live).toContain('Hi!')
    expect(live).toContain('● bash')
    expect(live).toContain('ok')
    expect(live).toContain('error ● orphan')
    expect(live).toContain('late-ok')
    expect(live).toContain('note')
    view.reset()
    expect(view.container.children).toHaveLength(0)
    expect(view.lastDiff()).toBeUndefined()
    expect(view.pendingWorkLabel()).toBeUndefined()

    const pending = new TranscriptView(() => ({
      presentCall: () => ({ card: 'generic' as const, title: 'Run tests' }),
    } as unknown as ToolDefinition))
    expect(pending.pendingWorkLabel()).toBeUndefined()
    pending.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('live'), name: 'bash', arguments: '{}',
    }), false)
    expect(pending.pendingWorkLabel()).toBe('Run tests')
    pending.applyEvent(event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('live'), content: [{ type: 'text', text: 'ok' }], isError: false,
      }),
    }), false)
    expect(pending.pendingWorkLabel()).toBeUndefined()

    const replay = new TranscriptView(() => undefined)
    replay.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'skip' },
    }), true)
    replay.applyEvent(event('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: '' }],
        source: { provider: 'p', model: 'm' },
      }),
    }), true)
    replay.applyEvent(event('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'prior' }],
        source: { provider: 'p', model: 'm' },
      }),
    }), true)
    expect(replay.container.render(80).join('\n')).toContain('prior')
    expect(replay.container.render(80).join('\n')).not.toContain('skip')

    const liveMessage = new TranscriptView(() => undefined)
    liveMessage.applyEvent(event('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'unstreamed' }],
        source: { provider: 'p', model: 'm' },
      }),
    }), false)
    expect(liveMessage.container.render(80).join('\n')).not.toContain('unstreamed')
  })

  it('streams and replays reasoning ahead of the assistant answer', () => {
    const view = new TranscriptView(() => undefined)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: '' },
    }), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'consider' },
    }), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: ' this' },
    }), false)
    view.applyEvent(event('assistant/chunk', {
      turn: 1, step: 1, chunk: { type: 'text-delta', index: 1, text: 'Done' },
    }), false)
    view.applyEvent(event('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({
        content: [
          { type: 'reasoning', text: 'consider this' },
          { type: 'text', text: 'Done' },
        ],
        source: { provider: 'p', model: 'm' },
      }),
    }), false)
    const live = view.container.render(80).join('\n')
    expect(live).toContain('Thinking')
    expect(live).toContain('consider this')
    expect(live).toContain('Done')

    const replay = new TranscriptView(() => undefined)
    replay.applyEvent(event('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({
        content: [
          { type: 'reasoning', text: '' },
          { type: 'reasoning', text: 'prior plan' },
          { type: 'text', text: '' },
          { type: 'text', text: 'prior answer' },
          { type: 'image', attachment: { id: 'img' } as never },
        ],
        source: { provider: 'p', model: 'm' },
      }),
    }), true)
    const history = replay.container.render(80).join('\n')
    expect(history).toContain('Thinking')
    expect(history).toContain('prior plan')
    expect(history).toContain('prior answer')
    expect(history).not.toContain('[image]')
  })

  it('paints compaction and feedback as dim transcript rows', () => {
    const view = new TranscriptView(() => undefined)
    view.applyEvent({
      type: 'compaction/summary',
      seq: 1,
      time: 0,
      data: {
        compactionId: 'c1' as never,
        summary: 'older turns folded',
        shadowedRange: { start: 1, end: 2 },
        shadowedSeqs: [1],
        shadowedTokenCount: 10,
      },
    } as never, true)
    view.applyEvent({
      type: 'feedback/record',
      seq: 2,
      time: 0,
      data: { text: 'the diff view is unreadable' },
    } as never, true)
    const painted = view.container.render(80).join('\n')
    expect(painted).toContain('compacted')
    expect(painted).toContain('feedback: the diff view is unreadable')
  })

  it('uses presentCall/presentResult and survives presenter failures', () => {
    const tool = {
      presentCall: (args: unknown) => {
        if (args === 'bad') throw new Error('call')
        return { card: 'generic' as const, title: 'Listed', rawInput: { n: 1 } }
      },
      presentResult: (_args: unknown, result: { isError: boolean; meta?: unknown }) => {
        if (result.meta !== undefined) throw new Error('result')
        return { card: 'generic' as const, title: 'Done', content: [{ type: 'text' as const, text: 'shown' }] }
      },
    } as unknown as ToolDefinition
    const view = new TranscriptView(name => name === 'ls' ? tool : undefined)
    view.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('a'), name: 'ls', arguments: 'not-json',
    }), false)
    view.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('b'), name: 'ls', arguments: '{"n":1}',
    }), false)
    view.applyEvent(event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('b'), content: [{ type: 'text', text: 'raw' }], isError: false,
      }),
    }), false)
    view.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('c'), name: 'ls', arguments: '"bad"',
    }), false)
    view.applyEvent(event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('c'), content: [{ type: 'text', text: 'kept' }], isError: false,
      }),
      meta: { x: 1 },
    }), false)
    const text = view.container.render(80).join('\n')
    expect(text).toContain('● ls')
    expect(text).toContain('● Listed')
    expect(text).toContain('{"n":1}')
    expect(text).toContain('● Done')
    expect(text).toContain('shown')
    expect(text).toContain('kept')
  })

  it('expands the last tool card and remembers the last diff', () => {
    const tool = {
      presentCall: () => ({
        card: 'diff' as const,
        title: 'Edit a.ts',
        diffs: [{ path: 'a.ts', oldText: 'old', newText: 'new' }],
      }),
    } as unknown as ToolDefinition
    const empty = new TranscriptView(() => undefined)
    expect(empty.toggleLastExpand()).toBe(false)
    expect(empty.lastDiff()).toBeUndefined()
    const view = new TranscriptView(name => name === 'edit' ? tool : undefined)
    view.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('d1'), name: 'bash', arguments: '{}',
    }), false)
    view.applyEvent(event('tool/call', {
      turn: 1, step: 1, callId: CallId('d2'), name: 'edit', arguments: '{}',
    }), false)
    expect(view.lastDiff()?.title).toContain('Edit a.ts')
    expect(view.toggleLastExpand()).toBe(true)
    expect(view.container.render(80).join('\n')).toContain('- old')
  })

  it('shows a pending inbox row and dismisses it for claim, discard, and durable user/message', () => {
    const view = new TranscriptView(() => undefined)
    const steered = createUserMessage({
      content: [{ type: 'text', text: 'keep going' }],
      source: { kind: 'user' },
    })
    view.showPending(steered.id, 'steering', '')
    expect(view.container.render(80).join('\n')).not.toContain('appending')
    view.showPending(steered.id, 'steering', 'keep going')
    view.showPending(steered.id, 'steering', 'keep going')
    const live = view.container.render(80).join('\n')
    expect(live).toContain('appending')
    expect(live).toContain('keep going')
    view.dismissPending(steered.id)
    view.dismissPending(steered.id)
    expect(view.container.render(80).join('\n')).not.toContain('appending')

    const queued = createUserMessage({
      content: [{ type: 'text', text: 'after this' }],
      source: { kind: 'user' },
    })
    view.showPending(queued.id, 'queued', 'after this')
    expect(view.container.render(80).join('\n')).toContain('queued')
    view.applyEvent(event('user/message', queued), false)
    const after = view.container.render(80).join('\n')
    expect(after).not.toContain('queued')
    expect(after).toContain('after this')
  })

  it('paints an optimistic user bubble and skips the matching durable event', () => {
    const view = new TranscriptView(() => undefined)
    view.paintUser('')
    expect(view.container.render(80).join('\n')).not.toContain('hello')
    view.paintUser('hello')
    const painted = view.container.render(80).join('\n')
    expect(painted).toContain('hello')
    view.applyEvent(event('user/message', createUserMessage({
      content: [{ type: 'text', text: 'hello' }],
      source: { kind: 'user' },
    })), false)
    expect(view.container.render(80).join('\n')).toBe(painted)
    view.applyEvent(event('user/message', createUserMessage({
      content: [{ type: 'text', text: 'again' }],
      source: { kind: 'user' },
    })), false)
    expect(view.container.render(80).join('\n')).toContain('again')
  })
})
