/**
 * Pi dark-theme tokens and the pi-tui editor, Markdown, and select-list adapters.
 * Hex values match earendil-works/pi coding-agent `dark.json`.
 * @module @deepseek-ai/dsh-tui/theme
 */

import type { EditorTheme, MarkdownTheme, SelectListTheme } from '@earendil-works/pi-tui'

/** Truecolor tokens from Pi's shipped dark theme. */
export const TUI_COLOR = {
  accent: '#8abeb7',
  borderMuted: '#505050',
  error: '#cc6666',
  muted: '#808080',
  dim: '#666666',
  text: '#d4d4d4',
  userMessageBg: '#343541',
  userMessageText: '#d4d4d4',
  toolPendingBg: '#282832',
  toolSuccessBg: '#283228',
  toolErrorBg: '#3c2828',
  mdHeading: '#f0c674',
  mdLink: '#81a2be',
  mdLinkUrl: '#666666',
  mdCode: '#8abeb7',
  mdCodeBlock: '#b5bd68',
  mdCodeBlockBorder: '#808080',
  mdQuote: '#808080',
  mdQuoteBorder: '#808080',
  mdHr: '#808080',
  mdListBullet: '#8abeb7',
} as const

/**
 * Wrap `text` in a truecolor foreground. Resets only the foreground so a
 * surrounding background (user bubble, tool card) stays intact.
 * @param hex - `#rrggbb`.
 * @param text - the fragment to color.
 * @returns `text` with an SGR 38:2 prefix and a foreground reset.
 */
export function fg(hex: string, text: string): string {
  return `${sgr(38, hex)}${text}\x1b[39m`
}

/**
 * Wrap `text` in a truecolor background. Resets only the background so
 * foreground styles inside the fragment survive.
 * @param hex - `#rrggbb`.
 * @param text - the fragment to paint, including trailing spaces for full-width fills.
 * @returns `text` with an SGR 48:2 prefix and a background reset.
 */
export function bg(hex: string, text: string): string {
  return `${sgr(48, hex)}${text}\x1b[49m`
}

/**
 * @param text - the fragment to embolden.
 * @returns `text` with SGR bold on and intensity reset.
 */
export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`
}

/**
 * @param text - the fragment to italicize.
 * @returns `text` with SGR italic on and off.
 */
export function italic(text: string): string {
  return `\x1b[3m${text}\x1b[23m`
}

/**
 * @param text - the fragment to underline.
 * @returns `text` with SGR underline on and off.
 */
export function underline(text: string): string {
  return `\x1b[4m${text}\x1b[24m`
}

/**
 * @param text - the fragment to strike.
 * @returns `text` with SGR strikethrough on and off.
 */
export function strikethrough(text: string): string {
  return `\x1b[9m${text}\x1b[29m`
}

/** Autocomplete and overlay select-list colors: accent selection, muted chrome. */
export const TUI_SELECT_LIST_THEME: SelectListTheme = {
  selectedPrefix: text => fg(TUI_COLOR.accent, text),
  selectedText: text => fg(TUI_COLOR.accent, text),
  description: text => fg(TUI_COLOR.muted, text),
  scrollInfo: text => fg(TUI_COLOR.muted, text),
  noMatch: text => fg(TUI_COLOR.muted, text),
}

/** Editor chrome: muted top/bottom rules and the shared select-list theme. */
export const TUI_EDITOR_THEME: EditorTheme = {
  borderColor: text => fg(TUI_COLOR.borderMuted, text),
  selectList: TUI_SELECT_LIST_THEME,
}

/** Markdown element colors and emphasis, matching Pi's `getMarkdownTheme()`. */
export const TUI_MARKDOWN_THEME: MarkdownTheme = {
  heading: text => fg(TUI_COLOR.mdHeading, text),
  link: text => fg(TUI_COLOR.mdLink, text),
  linkUrl: text => fg(TUI_COLOR.mdLinkUrl, text),
  code: text => fg(TUI_COLOR.mdCode, text),
  codeBlock: text => fg(TUI_COLOR.mdCodeBlock, text),
  codeBlockBorder: text => fg(TUI_COLOR.mdCodeBlockBorder, text),
  quote: text => fg(TUI_COLOR.mdQuote, text),
  quoteBorder: text => fg(TUI_COLOR.mdQuoteBorder, text),
  hr: text => fg(TUI_COLOR.mdHr, text),
  listBullet: text => fg(TUI_COLOR.mdListBullet, text),
  bold,
  italic,
  strikethrough,
  underline,
}

function sgr(channel: 38 | 48, hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `\x1b[${String(channel)};2;${String(r)};${String(g)};${String(b)}m`
}
