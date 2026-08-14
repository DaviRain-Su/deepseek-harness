/** Built-in palettes, custom `$DSH_HOME/themes` files, and OMP adapters. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseThemeDocument } from '../src/theme-file.ts'
import {
  applyTuiTheme,
  bg,
  bold,
  currentTuiThemeId,
  fg,
  italic,
  listTuiThemeItems,
  listTuiThemes,
  PALETTE_KEYS,
  strikethrough,
  themeInternals,
  TUI_COLOR,
  TUI_EDITOR_THEME,
  TUI_MARKDOWN_THEME,
  TUI_SELECT_LIST_THEME,
  TUI_SYMBOL_THEME,
  underline,
} from '../src/theme.ts'
import { QUESTION_LIST_THEME } from '../src/questions.ts'

const originalThemesDir = themeInternals.themesDir
let themesDir = ''

beforeEach(() => {
  themesDir = mkdtempSync(join(tmpdir(), 'dsh-tui-themes-'))
  themeInternals.themesDir = () => themesDir
})

afterEach(() => {
  themeInternals.themesDir = originalThemesDir
  applyTuiTheme('dark')
  rmSync(themesDir, { recursive: true, force: true })
})

function paletteColors(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const colors: Record<string, unknown> = {}
  for (const key of PALETTE_KEYS) colors[key] = '#111111'
  return Object.assign(colors, overrides)
}

describe('TUI theme', () => {
  it('paints editor, Markdown, and select-list chrome with truecolor ANSI', () => {
    expect(TUI_EDITOR_THEME.selectList).toBe(TUI_SELECT_LIST_THEME)
    expect(QUESTION_LIST_THEME).toBe(TUI_SELECT_LIST_THEME)
    expect(TUI_SYMBOL_THEME.spinnerFrames[0]).toBe('⠋')
    expect(TUI_SYMBOL_THEME.spinnerFrames).toHaveLength(10)
    expect(TUI_EDITOR_THEME.hintStyle?.('h')).toBe(fg(TUI_COLOR.dim, 'h'))
    expect(TUI_EDITOR_THEME.borderColor('x')).toBe(fg(TUI_COLOR.borderMuted, 'x'))
    expect(TUI_SELECT_LIST_THEME.selectedPrefix('*')).toBe(fg(TUI_COLOR.accent, '*'))
    expect(TUI_SELECT_LIST_THEME.selectedText('a')).toBe(fg(TUI_COLOR.accent, 'a'))
    expect(TUI_SELECT_LIST_THEME.description('d')).toBe(fg(TUI_COLOR.muted, 'd'))
    expect(TUI_SELECT_LIST_THEME.scrollInfo('s')).toBe(fg(TUI_COLOR.muted, 's'))
    expect(TUI_SELECT_LIST_THEME.noMatch('n')).toBe(fg(TUI_COLOR.muted, 'n'))
    expect(TUI_SELECT_LIST_THEME.hovered?.('x')).toBe(bg(TUI_COLOR.selectedBg, 'x'))
    expect(TUI_MARKDOWN_THEME.heading('# t')).toBe(fg(TUI_COLOR.mdHeading, '# t'))
    expect(TUI_MARKDOWN_THEME.link('a')).toBe(fg(TUI_COLOR.mdLink, 'a'))
    expect(TUI_MARKDOWN_THEME.linkUrl('u')).toBe(fg(TUI_COLOR.mdLinkUrl, 'u'))
    expect(TUI_MARKDOWN_THEME.code('x')).toBe(fg(TUI_COLOR.mdCode, 'x'))
    expect(TUI_MARKDOWN_THEME.codeBlock('y')).toBe(fg(TUI_COLOR.mdCodeBlock, 'y'))
    expect(TUI_MARKDOWN_THEME.codeBlockBorder('|')).toBe(fg(TUI_COLOR.mdCodeBlockBorder, '|'))
    expect(TUI_MARKDOWN_THEME.quote('q')).toBe(fg(TUI_COLOR.mdQuote, 'q'))
    expect(TUI_MARKDOWN_THEME.quoteBorder('>')).toBe(fg(TUI_COLOR.mdQuoteBorder, '>'))
    expect(TUI_MARKDOWN_THEME.hr('---')).toBe(fg(TUI_COLOR.mdHr, '---'))
    expect(TUI_MARKDOWN_THEME.listBullet('-')).toBe(fg(TUI_COLOR.mdListBullet, '-'))
    expect(TUI_MARKDOWN_THEME.symbols).toBe(TUI_SYMBOL_THEME)
    expect(TUI_MARKDOWN_THEME.bold('b')).toBe(bold('b'))
    expect(TUI_MARKDOWN_THEME.italic('i')).toBe(italic('i'))
    expect(TUI_MARKDOWN_THEME.underline('u')).toBe(underline('u'))
    expect(TUI_MARKDOWN_THEME.strikethrough('s')).toBe(strikethrough('s'))
    expect(fg(TUI_COLOR.text, 'hi')).toContain('\x1b[38;2;')
    expect(bg(TUI_COLOR.userMessageBg, 'hi')).toContain('\x1b[48;2;')
    expect(fg(TUI_COLOR.text, 'hi')).toContain('\x1b[39m')
    expect(bg(TUI_COLOR.userMessageBg, 'hi')).toContain('\x1b[49m')
    expect(fg('', 'hi')).toBe('hi')
    expect(bg('', 'hi')).toBe('hi')
  })

  it('switches the live palette through /theme ids', () => {
    expect(listTuiThemes()).toEqual(['dark', 'dark-tokyo-night', 'dark-catppuccin', 'light'])
    expect(currentTuiThemeId()).toBe('dark')
    expect(applyTuiTheme('missing')).toBe(false)
    expect(applyTuiTheme('dark-tokyo-night')).toBe(true)
    expect(currentTuiThemeId()).toBe('dark-tokyo-night')
    expect(TUI_COLOR.accent).toBe('#bb9af7')
    expect(TUI_EDITOR_THEME.borderColor('x')).toBe(fg(TUI_COLOR.borderMuted, 'x'))
    expect(applyTuiTheme('light')).toBe(true)
    expect(TUI_COLOR.accent).toBe('#d19a66')
    expect(applyTuiTheme('dark-catppuccin')).toBe(true)
    expect(TUI_COLOR.accent).toBe('#fab387')
    expect(TUI_COLOR.diffAdd).toBe('#a6e3a1')
  })

  it('lists custom JSON stems after builtins and skips a colliding builtin id', () => {
    writeFileSync(join(themesDir, 'dark.json'), JSON.stringify({ colors: paletteColors({ accent: '#000000' }) }))
    writeFileSync(join(themesDir, 'mine.json'), JSON.stringify({ colors: paletteColors({ accent: '#abcdef' }) }))
    expect(listTuiThemeItems()).toEqual([
      { value: 'dark', label: 'Dark' },
      { value: 'dark-tokyo-night', label: 'Tokyo Night' },
      { value: 'dark-catppuccin', label: 'Catppuccin' },
      { value: 'light', label: 'Light' },
      { value: 'mine', label: 'mine', description: 'custom' },
    ])
    expect(applyTuiTheme('dark')).toBe(true)
    expect(TUI_COLOR.accent).toBe('#8abeb7')
    expect(applyTuiTheme('mine')).toBe(true)
    expect(TUI_COLOR.accent).toBe('#abcdef')
  })

  it('treats a missing themes directory as no custom files', () => {
    themeInternals.themesDir = () => join(themesDir, 'absent')
    expect(listTuiThemes()).toEqual(['dark', 'dark-tokyo-night', 'dark-catppuccin', 'light'])
  })

  it('throws when the themes path exists but is not a directory', () => {
    const file = join(themesDir, 'not-a-dir')
    writeFileSync(file, 'x')
    themeInternals.themesDir = () => file
    expect(() => listTuiThemes()).toThrow()
  })

  it('parses OMP colors/vars, 256 indexes, empty terminal defaults, and diff aliases', () => {
    const document = {
      name: 'from-omp',
      syntax: { ignored: true },
      vars: {
        accent: '#AbC',
        add: '#00ff00',
      },
      colors: paletteColors({
        accent: 'accent',
        muted: 8,
        text: '',
        diffAdd: undefined,
        toolDiffAdded: 'add',
        toolDiffRemoved: '#ff0000',
      }),
    }
    delete document.colors.diffAdd
    delete document.colors.diffDel
    const palette = parseThemeDocument(JSON.stringify(document), 'omp.json')
    expect(palette.accent).toBe('#aabbcc')
    expect(palette.muted).toBe('#808080')
    expect(palette.text).toBe('')
    expect(palette.diffAdd).toBe('#00ff00')
    expect(palette.diffDel).toBe('#ff0000')
  })

  it('loads a flat palette file and rejects invalid JSON, cycles, and missing keys', () => {
    writeFileSync(join(themesDir, 'flat.json'), JSON.stringify(paletteColors({ accent: '#ffffff' })))
    expect(applyTuiTheme('flat')).toBe(true)
    expect(TUI_COLOR.accent).toBe('#ffffff')
    writeFileSync(join(themesDir, 'bad.json'), '{')
    expect(() => applyTuiTheme('bad')).toThrow(/invalid theme JSON/)
    expect(() => parseThemeDocument('[]', 'arr.json')).toThrow(/expected an object/)
    expect(() => parseThemeDocument(JSON.stringify({ colors: {} }), 'empty.json')).toThrow(/missing color accent/)
    expect(() => parseThemeDocument(JSON.stringify({
      vars: { a: 'b', b: 'a' },
      colors: paletteColors({ accent: 'a' }),
    }), 'cycle.json')).toThrow(/circular var/)
    expect(() => parseThemeDocument(JSON.stringify({
      colors: paletteColors({ muted: 256 }),
    }), 'range.json')).toThrow(/256-index out of range/)
    expect(applyTuiTheme('../escape')).toBe(false)
  })
})
