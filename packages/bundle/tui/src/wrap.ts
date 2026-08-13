/**
 * Display-column wrapping used by every custom TUI row.
 * @module @deepseek-ai/dsh-tui/wrap
 */

import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'

/**
 * Split `text` into lines that each fit in `width` display columns.
 * Wrapping uses pi-tui's column metric, so CJK and ANSI sequences do not
 * overflow the terminal the way code-unit slicing would.
 * @param text - the raw fragment, which may contain newlines.
 * @param width - maximum display columns per line; values below 1 keep the text intact.
 * @returns one string per display row, including blank rows for empty input.
 */
export function wrapLine(text: string, width: number): string[] {
  if (width < 1) return text === '' ? [''] : text.split('\n')
  return wrapTextWithAnsi(text, width).map(line =>
    visibleWidth(line) <= width ? line : truncateToWidth(line, width),
  )
}
