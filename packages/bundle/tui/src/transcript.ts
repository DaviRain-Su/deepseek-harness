/**
 * Transcript assembly: session events become Pi-style chat and tool blocks.
 * @module @deepseek-ai/dsh-tui/transcript
 */

import { Container, Text } from '@earendil-works/pi-tui'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolCallView, ToolDefinition, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import { AssistantMessageBlock, UserMessageBlock } from './messages.ts'
import { fg, TUI_COLOR } from './theme.ts'
import { ToolCard, linesForCall, linesForResult } from './tools.ts'

export { wrapLine } from './wrap.ts'

/** Resolve a tool definition by name for `presentCall` / `presentResult`. */
export type ToolLookup = (name: string) => ToolDefinition | undefined

/**
 * Join visible text from content blocks, skipping reasoning.
 * @param blocks - message or tool-result content.
 * @returns concatenated visible text; images become `[image]`.
 */
export function extractText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push(block.text)
        break
      case 'image':
        parts.push('[image]')
        break
      case 'tool-call':
        parts.push(`${block.name}()`)
        break
      case 'tool-result':
        parts.push(extractText(block.content))
        break
      case 'reasoning':
        break
      default:
        break
    }
  }
  return parts.join('')
}

/**
 * Live transcript container: user Markdown, streaming assistant Markdown, and
 * in-place tool cards keyed by call id.
 */
export class TranscriptView {
  /** The pi-tui child tree mounted under the session header. */
  readonly container = new Container()
  private stream: AssistantMessageBlock | undefined
  private streamed = false
  private readonly pending = new Map<string, PendingTool>()

  /**
   * @param lookup - live `ctx.tools.get` for the current Agent scope.
   */
  constructor(private readonly lookup: ToolLookup) {}

  /**
   * Append a notice that is not a session event.
   * @param text - the notice body.
   */
  notice(text: string): void {
    this.container.addChild(new Text(fg(TUI_COLOR.dim, text)))
  }

  /**
   * Fold one session event into the transcript.
   * @param event - the durable session event.
   * @param replay - historical events skip chunks and keep assembled messages.
   */
  applyEvent(event: SessionEvent, replay: boolean): void {
    if (!replay && event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type !== 'text-delta' || chunk.text === '') return
      if (this.stream === undefined) {
        this.stream = new AssistantMessageBlock(chunk.text)
        this.container.addChild(this.stream)
      } else {
        this.stream.append(chunk.text)
      }
      this.streamed = true
      return
    }
    if (!replay && event.type === 'assistant/message' && this.streamed) {
      this.streamed = false
      this.stream = undefined
      return
    }
    if (event.type === 'user/message') {
      if (event.data.source.kind !== 'user') return
      const text = extractText(event.data.content)
      if (text === '') return
      this.stream = undefined
      this.streamed = false
      this.container.addChild(new UserMessageBlock(text))
      return
    }
    if (event.type === 'assistant/message') {
      if (!replay) return
      const text = extractText(event.data.message.content)
      if (text === '') return
      this.container.addChild(new AssistantMessageBlock(text))
      return
    }
    if (event.type === 'tool/call') {
      this.addToolCall(event.data.name, event.data.callId, event.data.arguments)
      return
    }
    if (event.type === 'tool/result') {
      this.completeTool(event)
    }
  }

  private addToolCall(name: string, callId: string, raw: string): void {
    const args = parseArgs(raw)
    const view = presentCall(this.lookup(name), name, args)
    const lines = linesForCall(view)
    const card = new ToolCard(lines.title, lines.body)
    this.pending.set(callId, { card, name, args, title: lines.title })
    this.container.addChild(card)
  }

  private completeTool(event: SessionEvent<'tool/result'>): void {
    const { message, meta, error } = event.data
    const [block] = message.content
    const callId = message.source.callId
    const pending = this.pending.get(callId)
    this.pending.delete(callId)
    const name = pending?.name ?? String(callId)
    const args = pending?.args
    const isError = block.isError === true || error !== undefined
    const view = presentResult(this.lookup(name), args, {
      content: block.content,
      isError,
      ...meta === undefined ? {} : { meta },
    })
    const raw = extractText(
      view !== undefined && view.card === 'generic' && view.content !== undefined
        ? view.content
        : block.content,
    )
    const lines = linesForResult(pending?.title ?? `● ${name}`, view, raw, isError)
    if (pending === undefined) {
      this.container.addChild(new ToolCard(lines.title, lines.body, isError ? 'error' : 'ok'))
      return
    }
    pending.card.complete(lines.title, lines.body, isError)
  }
}

interface PendingTool {
  card: ToolCard
  name: string
  args: unknown
  title: string
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    // tool/call arguments are JSON at the session boundary; a corrupt payload still has to render.
    return raw
  }
}

function presentCall(tool: ToolDefinition | undefined, name: string, args: unknown): ToolCallView {
  try {
    return tool?.presentCall?.(args) ?? { card: 'generic', title: name }
  } catch {
    // A throwing presenter must not crash the TTY; the generic card still names the tool.
    return { card: 'generic', title: name }
  }
}

function presentResult(
  tool: ToolDefinition | undefined,
  args: unknown,
  result: ToolResult,
): ToolResultView | undefined {
  if (args === undefined || tool?.presentResult === undefined) return undefined
  try {
    return tool.presentResult(args, result)
  } catch {
    // A throwing presenter must not crash the TTY; the card keeps the pending title and raw text.
    return undefined
  }
}
