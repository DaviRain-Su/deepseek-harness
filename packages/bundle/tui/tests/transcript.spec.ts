/** Pure transcript formatting and event assembly. */

import { describe, expect, it } from 'vitest'
import { visibleWidth } from '@earendil-works/pi-tui'
import { CallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { AssistantMessageBlock, UserMessageBlock } from '../src/messages.ts'
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
    assistant.invalidate()
    expect(assistant.render(40).some(line => line.includes('Hi there'))).toBe(true)
    for (const line of new AssistantMessageBlock('你好世界').render(4)) {
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

  it('uses presentCall/presentResult and survives presenter failures', () => {
    const tool = {
      presentCall: (args: unknown) => {
        if (args === 'bad') throw new Error('call')
        return { card: 'generic' as const, title: 'Listed', rawInput: { n: 1 } }
      },
      presentResult: (_args: unknown, result: { isError: boolean }) => {
        if (result.meta !== undefined) throw new Error('result')
        return { card: 'generic' as const, title: 'Done', content: [{ type: 'text' as const, text: 'shown' }] }
      },
    } as ToolDefinition
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
})
