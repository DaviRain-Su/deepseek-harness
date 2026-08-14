/**
 * FileDiff → single-column TUI rows: exact changed lines when a bounded LCS
 * finishes, otherwise a whole-side fallback marked approximate.
 * @module @deepseek-ai/dsh-tui/diff
 */

import { assertNever } from '@deepseek-ai/dsh-llm'
import type { FileDiff } from '@deepseek-ai/dsh-tools'
import { bold, fg, TUI_COLOR } from './theme.ts'

/** `oldLen * newLen` cells above which a hunk falls back to whole-side rows. */
export const DIFF_COMPARE_CELLS = 12_000

/** One painted body row of a diff card. */
export type DiffRowKind = 'path' | 'ctx' | 'del' | 'add'

/** A path header or a prefixed content line. */
export interface DiffRow {
  kind: DiffRowKind
  text: string
}

/** Flattened hunks plus the footer counts a card always shows. */
export interface DiffDocument {
  rows: DiffRow[]
  added: number
  removed: number
  files: number
  approximate: boolean
  footer: string
}

/**
 * Split a side's text into content lines. Empty text is zero lines; a single
 * trailing newline terminates the last line rather than adding a phantom row.
 * @param text - one side of a {@link FileDiff}.
 * @returns the content lines, without the terminating newline.
 */
export function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * Flatten `diffs` into prefixed rows and a `└ +A -R · N file(s)` footer.
 * Same-file later hunks keep their own path header. Added/removed counts are
 * exact changed rows unless a hunk used the whole-side fallback, in which case
 * the footer ends with ` ≈`.
 * @param diffs - call- or result-time hunks, in file order.
 * @returns the document a card or overlay paints.
 */
export function buildDiff(diffs: readonly FileDiff[]): DiffDocument {
  const rows: DiffRow[] = []
  const paths = new Set<string>()
  let added = 0
  let removed = 0
  let approximate = false
  for (const diff of diffs) {
    paths.add(diff.path)
    rows.push({ kind: 'path', text: diff.path })
    const oldLines = diff.oldText === null ? [] : contentLines(diff.oldText)
    const classified = classifyLines(oldLines, contentLines(diff.newText))
    if (classified.approximate) approximate = true
    for (const row of classified.rows) {
      rows.push(row)
      if (row.kind === 'add') added += 1
      else if (row.kind === 'del') removed += 1
    }
  }
  const files = paths.size
  const suffix = approximate ? ' ≈' : ''
  const footer = `└ +${String(added)} -${String(removed)} · ${String(files)} file${files === 1 ? '' : 's'}${suffix}`
  return { rows, added, removed, files, approximate, footer }
}

/**
 * Prefix each row the way the card copies and paints it.
 * @param row - one document row.
 * @returns the uncolored display line.
 */
export function formatDiffRow(row: DiffRow): string {
  switch (row.kind) {
    case 'del':
      return `- ${row.text}`
    case 'add':
      return `+ ${row.text}`
    case 'ctx':
      return `  ${row.text}`
    case 'path':
      return row.text
    default:
      return assertNever(row.kind)
  }
}

/**
 * Uncolored card body: prefixed rows followed by the footer.
 * @param diffs - call- or result-time hunks.
 * @returns lines {@link ToolCard} caps, expands, and paints.
 */
export function diffBody(diffs: readonly FileDiff[]): string[] {
  const document = buildDiff(diffs)
  return [...document.rows.map(formatDiffRow), document.footer]
}

/**
 * Color one formatted diff line from its untruncated prefix.
 * @param clipped - the display line, possibly truncated to the card width.
 * @param original - the untruncated formatted line, used to pick the role.
 * @returns `clipped` with the role's foreground.
 */
export function paintDiffLine(clipped: string, original: string): string {
  if (original.startsWith('└ ')) return fg(TUI_COLOR.dim, clipped)
  if (original.startsWith('- ')) return fg(TUI_COLOR.diffDel, clipped)
  if (original.startsWith('+ ')) return fg(TUI_COLOR.diffAdd, clipped)
  if (original.startsWith('  ')) return fg(TUI_COLOR.muted, clipped)
  return fg(TUI_COLOR.text, bold(clipped))
}

function classifyLines(oldLines: readonly string[], newLines: readonly string[]): {
  rows: DiffRow[]
  approximate: boolean
} {
  if (oldLines.length === 0) {
    return { rows: newLines.map(text => ({ kind: 'add', text })), approximate: false }
  }
  if (newLines.length === 0) {
    return { rows: oldLines.map(text => ({ kind: 'del', text })), approximate: false }
  }
  if (oldLines.length * newLines.length > DIFF_COMPARE_CELLS) {
    return {
      rows: [
        ...oldLines.map(text => ({ kind: 'del' as const, text })),
        ...newLines.map(text => ({ kind: 'add' as const, text })),
      ],
      approximate: true,
    }
  }
  return { rows: lcsRows(oldLines, newLines), approximate: false }
}

function lcsRows(oldLines: readonly string[], newLines: readonly string[]): DiffRow[] {
  const oldLen = oldLines.length
  const newLen = newLines.length
  const width = newLen + 1
  const dp = new Uint32Array((oldLen + 1) * width)
  for (let i = 1; i <= oldLen; i += 1) {
    const oldLine = oldLines[i - 1]
    const row = i * width
    const prev = (i - 1) * width
    for (let j = 1; j <= newLen; j += 1) {
      dp[row + j] = oldLine === newLines[j - 1]
        ? (dp[prev + j - 1] ?? 0) + 1
        : Math.max(dp[prev + j] ?? 0, dp[row + j - 1] ?? 0)
    }
  }
  const rows: DiffRow[] = []
  let i = oldLen
  let j = newLen
  while (i > 0 && j > 0) {
    const oldLine = oldLines[i - 1]
    const newLine = newLines[j - 1]
    if (oldLine === undefined || newLine === undefined) break
    if (oldLine === newLine) {
      rows.push({ kind: 'ctx', text: oldLine })
      i -= 1
      j -= 1
      continue
    }
    if ((dp[(i - 1) * width + j] ?? 0) > (dp[i * width + j - 1] ?? 0)) {
      rows.push({ kind: 'del', text: oldLine })
      i -= 1
    } else {
      rows.push({ kind: 'add', text: newLine })
      j -= 1
    }
  }
  while (i > 0) {
    const oldLine = oldLines[i - 1]
    if (oldLine === undefined) break
    rows.push({ kind: 'del', text: oldLine })
    i -= 1
  }
  while (j > 0) {
    const newLine = newLines[j - 1]
    if (newLine === undefined) break
    rows.push({ kind: 'add', text: newLine })
    j -= 1
  }
  rows.reverse()
  return rows
}
