/**
 * Built-in TUI palettes and the OMP editor, Markdown, select-list, and symbol adapters.
 * Hex values for `dark` match Pi coding-agent `dark.json`; the others copy OMP default tokens.
 * Custom files live under `$DSH_HOME/themes/<id>.json`.
 * @module @deepseek-ai/dsh-tui/theme
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EditorTheme, MarkdownTheme, SelectListTheme, SymbolTheme } from '@oh-my-pi/pi-tui'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { parseThemeDocument, type TuiPalette } from './theme-file.ts'

export type { TuiPalette } from './theme-file.ts'
export { PALETTE_KEYS } from './theme-file.ts'

const BUILTIN_LABELS: Readonly<Record<string, string>> = {
  dark: 'Dark',
  'dark-tokyo-night': 'Tokyo Night',
  'dark-catppuccin': 'Catppuccin',
  light: 'Light',
}

/** Test and production hooks for custom theme discovery. */
export const themeInternals: {
  /** Directory of `<id>.json` palettes. Tests replace this. */
  themesDir: () => string
} = {
  themesDir: () => dshHomePath('themes'),
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

/** One `/theme` picker row. */
export interface TuiThemeItem {
  /** Builtin or custom file stem. */
  value: string
  /** Display name. */
  label: string
  /** Distinguishes a `$DSH_HOME/themes` file from a builtin. */
  description?: string
}

/**
 * Builtin ids first, then custom file stems that do not collide, sorted.
 * @returns theme ids in picker order.
 */
export function listTuiThemes(): readonly string[] {
  return listTuiThemeItems().map(item => item.value)
}

/**
 * `/theme` catalog: builtin labels, then custom `$DSH_HOME/themes/<id>.json` files.
 * @returns picker rows.
 */
export function listTuiThemeItems(): readonly TuiThemeItem[] {
  const items: TuiThemeItem[] = Object.keys(TUI_THEMES).map(id => ({
    value: id,
    label: BUILTIN_LABELS[id] ?? id,
  }))
  const seen = new Set(Object.keys(TUI_THEMES))
  for (const id of listCustomThemeIds()) {
    if (seen.has(id)) continue
    seen.add(id)
    items.push({ value: id, label: id, description: 'custom' })
  }
  return items
}

/**
 * Switch the live palette. Existing adapter functions read {@link TUI_COLOR}
 * on each paint, so a following `requestRender` updates chrome already on screen.
 * A missing id returns false. An unreadable or invalid custom file throws.
 * @param id - a builtin key or a custom file stem.
 * @returns false when `id` is not a builtin and no matching file exists.
 */
export function applyTuiTheme(id: string): boolean {
  const builtin = TUI_THEMES[id]
  if (builtin !== undefined) {
    activeThemeId = id
    Object.assign(TUI_COLOR, builtin)
    return true
  }
  const file = customThemePath(id)
  if (file === undefined) return false
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`cannot read theme ${id}: ${detail}`)
  }
  const palette = parseThemeDocument(raw, file)
  activeThemeId = id
  Object.assign(TUI_COLOR, palette)
  return true
}

function listCustomThemeIds(): readonly string[] {
  let names: string[]
  try {
    names = readdirSync(themeInternals.themesDir())
  } catch (error: unknown) {
    if (isMissingDir(error)) return []
    throw error
  }
  return names
    .filter(name => THEME_FILE.test(name))
    .map(name => name.slice(0, -'.json'.length))
    .sort()
}

function customThemePath(id: string): string | undefined {
  if (!THEME_STEM.test(id)) return undefined
  const names = listCustomThemeIds()
  if (!names.includes(id)) return undefined
  return join(themeInternals.themesDir(), `${id}.json`)
}

function isMissingDir(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const THEME_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
const THEME_STEM = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Wrap `text` in a truecolor foreground. Resets only the foreground so a
 * surrounding background (user bubble, tool card) stays intact. An empty
 * `hex` leaves the terminal default foreground.
 * @param hex - `#rrggbb`, or empty for the terminal default.
 * @param text - the fragment to color.
 * @returns `text` with an SGR 38:2 prefix and a foreground reset, or `text`.
 */
export function fg(hex: string, text: string): string {
  if (hex === '') return text
  return `${sgr(38, hex)}${text}\x1b[39m`
}

/**
 * Wrap `text` in a truecolor background. Resets only the background so
 * foreground styles inside the fragment survive. An empty `hex` leaves the
 * terminal default background.
 * @param hex - `#rrggbb`, or empty for the terminal default.
 * @param text - the fragment to paint, including trailing spaces for full-width fills.
 * @returns `text` with an SGR 48:2 prefix and a background reset, or `text`.
 */
export function bg(hex: string, text: string): string {
  if (hex === '') return text
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
