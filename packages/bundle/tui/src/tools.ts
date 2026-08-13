/**
 * Terminal mapping of `presentCall` / `presentResult` cards.
 * @module @deepseek-ai/dsh-tui/tools
 */

import { Box, truncateToWidth, type Component } from '@oh-my-pi/pi-tui'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import { bg, bold, fg, TUI_COLOR } from './theme.ts'
import { wrapLine } from './wrap.ts'

/** Pending, completed, or failed tool-card background. */
export type ToolCardStatus = 'pending' | 'ok' | 'error'

/** Collapsed tool-card body rows; the rest become a trailing "more" line. */
const TOOL_PREVIEW_ROWS = 8

/**
 * Title and body lines for a pending call card.
 * @param view - the tool's `presentCall` intent, or a generic fallback.
 * @returns a marker title and optional detail rows.
 */
export function linesForCall(view: ToolCallView): { title: string; body: string[] } {
  switch (view.card) {
    case 'generic':
      return { title: `● ${view.title}`, body: rawInputLines(view.rawInput) }
    case 'terminal':
      return {
        title: `❯ ${view.title}`,
        body: view.description === undefined ? [] : [view.description],
      }
    case 'diff':
      return { title: `✎ ${view.title}`, body: view.diffs.map(diff => diff.path) }
    default:
      return assertNever(view)
  }
}

/**
 * Title and body lines for a completed call card.
 * @param pendingTitle - the live card title when the result omits a replacement.
 * @param view - the tool's `presentResult` intent, or undefined to keep raw text.
 * @param raw - model-facing result text used when the view has no structured body.
 * @param isError - whether the call failed.
 * @returns the completed title and preview body.
 */
export function linesForResult(
  pendingTitle: string,
  view: ToolResultView | undefined,
  raw: string,
  isError: boolean,
): { title: string; body: string[] } {
  const prefix = isError ? 'error ' : ''
  if (view === undefined) {
    return { title: `${prefix}${pendingTitle}`, body: raw === '' ? [] : [raw] }
  }
  switch (view.card) {
    case 'generic':
      return { title: resultTitle(prefix, pendingTitle, '●', view.title), body: raw === '' ? [] : [raw] }
    case 'terminal':
      return {
        title: resultTitle(prefix, pendingTitle, '❯', view.title),
        body: terminalBody(view.output, view.exitCode, view.signal),
      }
    case 'diff':
      return {
        title: resultTitle(prefix, pendingTitle, '✎', view.title),
        body: view.diffs.map(diff => diff.path),
      }
    case 'search':
      return { title: resultTitle(prefix, pendingTitle, '●', view.title), body: searchBody(view) }
    case 'read':
      return {
        title: resultTitle(prefix, pendingTitle, '●', view.title),
        body: [view.path, ...view.lines.map(line => `${String(line.number)} ${line.text}`)],
      }
    case 'web':
      return { title: resultTitle(prefix, pendingTitle, '●', view.title), body: webBody(view) }
    default:
      return assertNever(view)
  }
}

/**
 * One tool-card component: a Pi `Box` with pending/success/error background,
 * a marker title, and a bounded body, updated in place when the matching
 * `tool/result` arrives.
 */
export class ToolCard implements Component {
  private readonly box: Box

  /**
   * @param title - the pending or completed marker line.
   * @param body - unwrapped detail rows; {@link render} wraps and caps them.
   * @param status - selects the card background and title color.
   */
  constructor(
    private title: string,
    private body: string[],
    private status: ToolCardStatus = 'pending',
  ) {
    this.box = new Box(1, 1, line => bg(toolBg(this.status), line))
    this.box.addChild({
      render: (width: number) => this.innerLines(width),
      invalidate: () => {},
    })
  }

  /**
   * Replace the pending card's title and body in place, keeping the pending
   * background: live progress such as a subagent run's activity feed.
   * @param title - the current marker line.
   * @param body - unwrapped detail rows.
   */
  update(title: string, body: string[]): void {
    this.title = title
    this.body = body
    this.box.invalidate()
  }

  /**
   * Replace the card with the completed title and body.
   * @param title - the completed marker line.
   * @param body - unwrapped detail rows.
   * @param isError - true paints the error background and title color.
   */
  complete(title: string, body: string[], isError = false): void {
    this.title = title
    this.body = body
    this.status = isError ? 'error' : 'ok'
    this.box.invalidate()
  }

  /**
   * @param width - columns available to this component.
   * @returns the painted card plus a trailing blank row.
   */
  render(width: number): string[] {
    return [...this.box.render(width), '']
  }

  /** Drop the Box width cache. */
  invalidate(): void {
    this.box.invalidate()
  }

  private innerLines(width: number): string[] {
    const title = this.status === 'error'
      ? fg(TUI_COLOR.error, this.title)
      : fg(TUI_COLOR.text, bold(this.title))
    return [...wrapLine(title, width), ...preview(this.body, width).map(line => fg(TUI_COLOR.muted, line))]
  }
}

function toolBg(status: ToolCardStatus): string {
  switch (status) {
    case 'pending':
      return TUI_COLOR.toolPendingBg
    case 'ok':
      return TUI_COLOR.toolSuccessBg
    case 'error':
      return TUI_COLOR.toolErrorBg
    default:
      return assertNever(status)
  }
}

function resultTitle(prefix: string, pending: string, marker: string, replacement: string | undefined): string {
  return `${prefix}${replacement === undefined ? pending : `${marker} ${replacement}`}`
}

function rawInputLines(rawInput: unknown): string[] {
  if (rawInput === undefined) return []
  if (typeof rawInput === 'string') return rawInput === '' ? [] : [rawInput]
  return [JSON.stringify(rawInput)]
}

function terminalBody(output: string | undefined, exitCode: number | undefined, signal: string | undefined): string[] {
  const lines: string[] = []
  if (output !== undefined && output !== '') lines.push(output)
  if (exitCode !== undefined) lines.push(`exit ${String(exitCode)}`)
  if (signal !== undefined) lines.push(signal)
  return lines
}

function searchBody(view: Extract<ToolResultView, { card: 'search' }>): string[] {
  switch (view.shape) {
    case 'matches': {
      const lines = view.files.flatMap(file =>
        file.matches.map(match => `${file.path}:${String(match.lineNumber)} ${match.line}`),
      )
      return view.truncated ? [...lines, `truncated ${String(view.total)}`] : lines
    }
    case 'paths': {
      const lines = [...view.paths]
      return view.truncated ? [...lines, `truncated ${String(view.total)}`] : lines
    }
    default:
      return assertNever(view)
  }
}

function webBody(view: Extract<ToolResultView, { card: 'web' }>): string[] {
  switch (view.kind) {
    case 'search': {
      const lines = [
        ...view.answer === undefined ? [] : [view.answer],
        ...view.sources.map(source => source.title === undefined ? source.url : `${source.title}  ${source.url}`),
      ]
      return view.truncated ? [...lines, 'truncated'] : lines
    }
    case 'fetch': {
      const lines = [`${String(view.statusCode)} ${view.url}`]
      return view.truncated ? [...lines, 'truncated'] : lines
    }
    default:
      return assertNever(view)
  }
}

function preview(lines: string[], width: number): string[] {
  const wrapped = lines.flatMap(line => wrapLine(line, width))
  if (wrapped.length <= TOOL_PREVIEW_ROWS) return wrapped
  const hidden = wrapped.length - TOOL_PREVIEW_ROWS
  return [...wrapped.slice(0, TOOL_PREVIEW_ROWS), truncateToWidth(`… ${String(hidden)} more`, width)]
}
