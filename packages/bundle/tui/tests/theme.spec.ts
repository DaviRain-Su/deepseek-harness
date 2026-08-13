/** Built-in palettes and OMP editor, Markdown, and select-list adapters. */

import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTuiTheme,
  bg,
  bold,
  currentTuiThemeId,
  fg,
  italic,
  listTuiThemes,
  strikethrough,
  TUI_COLOR,
  TUI_EDITOR_THEME,
  TUI_MARKDOWN_THEME,
  TUI_SELECT_LIST_THEME,
  TUI_SYMBOL_THEME,
  underline,
} from '../src/theme.ts'
import { QUESTION_LIST_THEME } from '../src/questions.ts'

afterEach(() => {
  applyTuiTheme('dark')
})

describe('TUI theme', () => {
  it('paints editor, Markdown, and select-list chrome with truecolor ANSI', () => {
    expect(TUI_EDITOR_THEME.selectList).toBe(TUI_SELECT_LIST_THEME)
    expect(QUESTION_LIST_THEME).toBe(TUI_SELECT_LIST_THEME)
    expect(TUI_EDITOR_THEME.symbols).toBe(TUI_SYMBOL_THEME)
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
  })
})
