/**
 * Built-in TUI palettes and the OMP editor, Markdown, select-list, and symbol adapters.
 * Hex values for `dark` match Pi coding-agent `dark.json`; the others copy OMP default tokens.
 * @module @deepseek-ai/dsh-tui/theme
 */

import type { EditorTheme, MarkdownTheme, SelectListTheme, SymbolTheme } from '@oh-my-pi/pi-tui'

/** Truecolor tokens one built-in theme paints with. */
export interface TuiPalette {
  accent: string
  borderMuted: string
  error: string
  muted: string
  dim: string
  text: string
  selectedBg: string
  userMessageBg: string
  userMessageText: string
  toolPendingBg: string
  toolSuccessBg: string
  toolErrorBg: string
  mdHeading: string
  mdLink: string
  mdLinkUrl: string
  mdCode: string
  mdCodeBlock: string
  mdCodeBlockBorder: string
  mdQuote: string
  mdQuoteBorder: string
  mdHr: string
  mdListBullet: string
  diffAdd: string
  diffDel: string
}

const DARK: TuiPalette = {
  accent: '#8abeb7',
  borderMuted: '#505050',
  error: '#cc6666',
  muted: '#808080',
  dim: '#666666',
  text: '#d4d4d4',
  selectedBg: '#3a3a3a',
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
  diffAdd: '#b5bd68',
  diffDel: '#cc6666',
}

const DARK_TOKYO_NIGHT: TuiPalette = {
  accent: '#bb9af7',
  borderMuted: '#363b54',
  error: '#db4b4b',
  muted: '#51597d',
  dim: '#51597d',
  text: '#a9b1d6',
  selectedBg: '#2a2f41',
  userMessageBg: '#16161e',
  userMessageText: '#a9b1d6',
  toolPendingBg: '#1a1e2e',
  toolSuccessBg: '#16191f',
  toolErrorBg: '#291d1d',
  mdHeading: '#bb9af7',
  mdLink: '#7dcfff',
  mdLinkUrl: '#51597d',
  mdCode: '#c0caf5',
  mdCodeBlock: '#a9b1d6',
  mdCodeBlockBorder: '#363b54',
  mdQuote: '#51597d',
  mdQuoteBorder: '#363b54',
  mdHr: '#363b54',
  mdListBullet: '#7dcfff',
  diffAdd: '#9ece6a',
  diffDel: '#db4b4b',
}

const DARK_CATPPUCCIN: TuiPalette = {
  accent: '#fab387',
  borderMuted: '#313244',
  error: '#f38ba8',
  muted: '#7f849c',
  dim: '#6c7086',
  text: '#cdd6f4',
  selectedBg: '#313244',
  userMessageBg: '#181825',
  userMessageText: '#cdd6f4',
  toolPendingBg: '#313244',
  toolSuccessBg: '#181825',
  toolErrorBg: '#11111b',
  mdHeading: '#fab387',
  mdLink: '#89b4fa',
  mdLinkUrl: '#6c7086',
  mdCode: '#f5e0dc',
  mdCodeBlock: '#cdd6f4',
  mdCodeBlockBorder: '#313244',
  mdQuote: '#7f849c',
  mdQuoteBorder: '#313244',
  mdHr: '#313244',
  mdListBullet: '#fab387',
  diffAdd: '#a6e3a1',
  diffDel: '#f38ba8',
}

const LIGHT: TuiPalette = {
  accent: '#d19a66',
  borderMuted: '#d6d6d6',
  error: '#c82829',
  muted: '#4d4d4c',
  dim: '#8e908c',
  text: '#4d4d4c',
  selectedBg: '#efe6d5',
  userMessageBg: '#f6f0e4',
  userMessageText: '#4d4d4c',
  toolPendingBg: '#f2ecdf',
  toolSuccessBg: '#e8f0e0',
  toolErrorBg: '#f0e0e0',
  mdHeading: '#d19a66',
  mdLink: '#4271ae',
  mdLinkUrl: '#8e908c',
  mdCode: '#4271ae',
  mdCodeBlock: '#718c00',
  mdCodeBlockBorder: '#d6d6d6',
  mdQuote: '#4d4d4c',
  mdQuoteBorder: '#d6d6d6',
  mdHr: '#d6d6d6',
  mdListBullet: '#d19a66',
  diffAdd: '#718c00',
  diffDel: '#c82829',
}

const SHARP: SymbolTheme['boxSharp'] = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeDown: '┬',
  teeUp: '┴',
  teeLeft: '┤',
  teeRight: '├',
  cross: '┼',
}

/** Rounded-box OMP symbol set shared by the editor, Markdown, and select lists. */
export const TUI_SYMBOL_THEME: SymbolTheme = {
  cursor: '❯',
  inputCursor: '▏',
  boxRound: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
  },
  boxSharp: SHARP,
  table: SHARP,
  quoteBorder: '│',
  hrChar: '─',
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
}

/** Built-in palettes keyed by `/theme` id. */
export const TUI_THEMES: Readonly<Record<string, TuiPalette>> = {
  dark: DARK,
  'dark-tokyo-night': DARK_TOKYO_NIGHT,
  'dark-catppuccin': DARK_CATPPUCCIN,
  light: LIGHT,
}

/** Live palette; `/theme` mutates this object so adapter functions stay current. */
export const TUI_COLOR: TuiPalette = { ...DARK }

let activeThemeId = 'dark'

/**
 * Active `/theme` id, starting at `dark`.
 * @returns the active `/theme` id.
 */
export function currentTuiThemeId(): string {
  return activeThemeId
}

/**
 * Built-in palette ids in the order `/theme` lists them.
 * @returns built-in theme ids in display order.
 */
export function listTuiThemes(): readonly string[] {
  return Object.keys(TUI_THEMES)
}

/**
 * Switch the live palette. Existing adapter functions read {@link TUI_COLOR}
 * on each paint, so a following `requestRender` updates chrome already on screen.
 * @param id - a key of {@link TUI_THEMES}.
 * @returns false when `id` is not a built-in theme.
 */
export function applyTuiTheme(id: string): boolean {
  const palette = TUI_THEMES[id]
  if (palette === undefined) return false
  activeThemeId = id
  Object.assign(TUI_COLOR, palette)
  return true
}

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
 * Apply SGR bold to `text`.
 * @param text - the fragment to embolden.
 * @returns `text` with SGR bold on and intensity reset.
 */
export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`
}

/**
 * Apply SGR italic to `text`.
 * @param text - the fragment to italicize.
 * @returns `text` with SGR italic on and off.
 */
export function italic(text: string): string {
  return `\x1b[3m${text}\x1b[23m`
}

/**
 * Apply SGR underline to `text`.
 * @param text - the fragment to underline.
 * @returns `text` with SGR underline on and off.
 */
export function underline(text: string): string {
  return `\x1b[4m${text}\x1b[24m`
}

/**
 * Apply SGR strikethrough to `text`.
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
  symbols: TUI_SYMBOL_THEME,
  hovered: text => bg(TUI_COLOR.selectedBg, text),
}

/** Editor chrome: muted rounded rules, ghost-text hint, and the shared select-list theme. */
export const TUI_EDITOR_THEME: EditorTheme = {
  borderColor: text => fg(TUI_COLOR.borderMuted, text),
  selectList: TUI_SELECT_LIST_THEME,
  symbols: TUI_SYMBOL_THEME,
  hintStyle: text => fg(TUI_COLOR.dim, text),
}

/** Markdown element colors and emphasis, matching OMP `getMarkdownTheme()`. */
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
  symbols: TUI_SYMBOL_THEME,
}

function sgr(channel: 38 | 48, hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `\x1b[${String(channel)};2;${String(r)};${String(g)};${String(b)}m`
}
