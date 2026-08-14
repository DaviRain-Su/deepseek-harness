/**
 * Transcript assembly: session events become Pi-style chat and tool blocks.
 * @module @deepseek-ai/dsh-tui/transcript
 */

import { Container, Text } from '@oh-my-pi/pi-tui'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { FileDiff, ToolCallView, ToolDefinition, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import {
  AssistantMessageBlock,
  PendingInputBlock,
  ThinkingBlock,
  UserMessageBlock,
  type PendingInputKind,
} from './messages.ts'
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
 * Live transcript container: user Markdown, streamed reasoning then assistant
 * Markdown, and in-place tool cards keyed by call id.
 */
export class TranscriptView {
  /** The pi-tui child tree mounted under the session header. */
  readonly container = new Container()
  private thinking: ThinkingBlock | undefined
  private stream: AssistantMessageBlock | undefined
  private streamed = false
  private lastPaintedUser: string | undefined
  private readonly pending = new Map<string, PendingTool>()
  private readonly pendingInputs = new Map<string, PendingInputBlock>()
  private readonly cards: ToolCard[] = []

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
   * Drop every child and in-flight stream so a switched session can replay
   * into an empty transcript. The container object stays mounted.
   */
  reset(): void {
    for (const child of [...this.container.children]) this.container.removeChild(child)
    this.thinking = undefined
    this.stream = undefined
    this.streamed = false
    this.lastPaintedUser = undefined
    this.pending.clear()
    this.pendingInputs.clear()
    this.cards.length = 0
  }

  /**
   * Paint a user bubble immediately on editor submit. A later `user/message`
   * with the same text is skipped so the durable event does not duplicate it.
   * @param text - the visible user message body.
   */
  paintUser(text: string): void {
    if (text === '') return
    this.lastPaintedUser = text
    this.stream = undefined
    this.thinking = undefined
    this.streamed = false
    this.container.addChild(new UserMessageBlock(text))
  }

  /**
   * Toggle the collapsed preview on the most recent tool card.
   * @returns whether a card flipped.
   */
  toggleLastExpand(): boolean {
    const card = this.cards.at(-1)
    if (card === undefined) return false
    return card.toggleExpand()
  }

  /**
   * Hunks of the most recent diff card, for the fullscreen overlay.
   * @returns the last file-mutation card's title and diffs, or undefined.
   */
  lastDiff(): { title: string; diffs: readonly FileDiff[] } | undefined {
    for (let index = this.cards.length - 1; index >= 0; index -= 1) {
      const view = this.cards[index]?.diffView()
      if (view !== undefined) return view
    }
    return undefined
  }

  /**
   * Show a transient row for a user-source inbox item until it is claimed,
   * discarded, or logged as `user/message`. Empty text is ignored. A second
   * call with the same id is a no-op.
   * @param id - the pending message id.
   * @param kind - next-step steering vs next-turn queue.
   * @param text - visible body.
   */
  showPending(id: string, kind: PendingInputKind, text: string): void {
    if (text === '' || this.pendingInputs.has(id)) return
    const block = new PendingInputBlock(kind, text)
    this.pendingInputs.set(id, block)
    this.container.addChild(block)
  }

  /**
   * Hide the transient inbox row for `id`. Idempotent when the row is gone.
   * @param id - the pending message id.
   */
  dismissPending(id: string): void {
    const block = this.pendingInputs.get(id)
    if (block === undefined) return
    this.pendingInputs.delete(id)
    block.dismiss()
  }

  /**
   * Fold one session event into the transcript.
   * @param event - the durable session event.
   * @param replay - historical events skip chunks and keep assembled messages.
   */
  applyEvent(event: SessionEvent, replay: boolean): void {
    if (!replay && event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') {
        if (chunk.text === '') return
        if (this.thinking === undefined) {
          this.thinking = new ThinkingBlock(chunk.text)
          this.container.addChild(this.thinking)
        } else {
          this.thinking.append(chunk.text)
        }
        this.streamed = true
        return
      }
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
      this.stream?.settle()
      this.streamed = false
      this.stream = undefined
      this.thinking = undefined
      return
    }
    if (event.type === 'user/message') {
      this.dismissPending(event.data.id)
      if (event.data.source.kind !== 'user') return
      const text = extractText(event.data.content)
      if (text === '') return
      this.stream = undefined
      this.thinking = undefined
      this.streamed = false
      if (text === this.lastPaintedUser) {
        this.lastPaintedUser = undefined
        return
      }
      this.container.addChild(new UserMessageBlock(text))
      return
    }
    if (event.type === 'assistant/message') {
      if (!replay) return
      this.addAssembledAssistant(event.data.message.content)
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

  /**
   * Replay an assembled assistant message as reasoning then answer blocks.
   * @param blocks - the durable assistant content.
   */
  private addAssembledAssistant(blocks: readonly ContentBlock[]): void {
    for (const block of blocks) {
      switch (block.type) {
        case 'reasoning':
          if (block.text !== '') this.container.addChild(new ThinkingBlock(block.text))
          break
        case 'text':
          if (block.text !== '') this.container.addChild(new AssistantMessageBlock(block.text))
          break
        default:
          break
      }
    }
  }

  private addToolCall(name: string, callId: string, raw: string): void {
    const args = parseArgs(raw)
    const view = presentCall(this.lookup(name), name, args)
    const lines = linesForCall(view)
    const card = new ToolCard(lines.title, lines.body, 'pending', lines.diffs)
    this.pending.set(callId, { card, name, args, title: lines.title })
    this.cards.push(card)
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
      const card = new ToolCard(lines.title, lines.body, isError ? 'error' : 'ok', lines.diffs)
      this.cards.push(card)
      this.container.addChild(card)
      return
    }
    pending.card.complete(lines.title, lines.body, isError, lines.diffs)
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

/**
 * Resolve one `tool/call` presentation intent for any transcript surface, so
 * the parent transcript and subagent activity feeds share the generic fallback
 * and corrupt-JSON tolerance.
 * @param lookup - tool definition resolver for the calling agent's scope.
 * @param name - the called tool name.
 * @param raw - the raw `tool/call` arguments payload.
 * @returns the tool's `presentCall` intent, or a generic card naming the tool.
 */
export function presentToolCall(lookup: ToolLookup, name: string, raw: string): ToolCallView {
  return presentCall(lookup(name), name, parseArgs(raw))
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
