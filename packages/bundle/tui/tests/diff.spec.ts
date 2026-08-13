/** FileDiff flattening, LCS changed-rows, and whole-side fallback. */

import { describe, expect, it } from 'vitest'
import {
  DIFF_COMPARE_CELLS,
  buildDiff,
  contentLines,
  diffBody,
  formatDiffRow,
  paintDiffLine,
} from '../src/diff.ts'
import { applyTuiTheme, TUI_COLOR } from '../src/theme.ts'

describe('contentLines', () => {
  it('treats empty text as zero lines and a trailing newline as a terminator', () => {
    expect(contentLines('')).toEqual([])
    expect(contentLines('a')).toEqual(['a'])
    expect(contentLines('a\n')).toEqual(['a'])
    expect(contentLines('a\n\nb')).toEqual(['a', '', 'b'])
  })
})

describe('buildDiff', () => {
  it('paints a create as added-only and an exact replace as del/add with context', () => {
    expect(buildDiff([{ path: 'a.ts', oldText: null, newText: 'x' }])).toMatchObject({
      added: 1, removed: 0, files: 1, approximate: false,
      footer: '└ +1 -0 · 1 file',
    })
    const edit = buildDiff([{ path: 'a.ts', oldText: 'a\nb\nc', newText: 'a\nx\nc' }])
    expect(edit.rows.map(row => `${row.kind}:${row.text}`)).toEqual([
      'path:a.ts', 'ctx:a', 'del:b', 'add:x', 'ctx:c',
    ])
    expect(edit.footer).toBe('└ +1 -1 · 1 file')
    expect(diffBody([{ path: 'a.ts', oldText: 'o', newText: 'n' }])).toEqual([
      'a.ts', '- o', '+ n', '└ +1 -1 · 1 file',
    ])
  })

  it('counts distinct paths, keeps a path header per hunk, and deletes to empty', () => {
    const docs = buildDiff([
      { path: 'a.ts', oldText: 'one', newText: 'two' },
      { path: 'a.ts', oldText: 'keep\ngone', newText: 'keep' },
      { path: 'b.ts', oldText: 'x', newText: '' },
    ])
    expect(docs.files).toBe(2)
    expect(docs.footer).toBe('└ +1 -3 · 2 files')
    expect(docs.rows.filter(row => row.kind === 'path').map(row => row.text)).toEqual(['a.ts', 'a.ts', 'b.ts'])
    expect(buildDiff([{ path: 'a.ts', oldText: 'keep', newText: 'keep' }]).footer).toBe('└ +0 -0 · 1 file')
    expect(buildDiff([{ path: 'a.ts', oldText: 'b', newText: 'a\nb' }]).rows.map(row => row.kind)).toEqual([
      'path', 'add', 'ctx',
    ])
    expect(buildDiff([{ path: 'a.ts', oldText: 'a\nb', newText: 'b' }]).rows.map(row => row.kind)).toEqual([
      'path', 'del', 'ctx',
    ])
    expect(buildDiff([]).footer).toBe('└ +0 -0 · 0 files')
  })

  it('falls back to whole-side rows when the comparison cell budget is exceeded', () => {
    const side = 111
    expect(side * side).toBeGreaterThan(DIFF_COMPARE_CELLS)
    const oldText = Array.from({ length: side }, (_, i) => `o${String(i)}`).join('\n')
    const newText = Array.from({ length: side }, (_, i) => `n${String(i)}`).join('\n')
    const document = buildDiff([{ path: 'big.ts', oldText, newText }])
    expect(document.approximate).toBe(true)
    expect(document.footer.endsWith(' ≈')).toBe(true)
    expect(document.added).toBe(side)
    expect(document.removed).toBe(side)
  })
})

describe('formatDiffRow and paintDiffLine', () => {
  it('prefixes and colors each row kind', () => {
    expect(formatDiffRow({ kind: 'path', text: 'a.ts' })).toBe('a.ts')
    expect(formatDiffRow({ kind: 'ctx', text: 'keep' })).toBe('  keep')
    expect(formatDiffRow({ kind: 'del', text: 'old' })).toBe('- old')
    expect(formatDiffRow({ kind: 'add', text: 'new' })).toBe('+ new')
    expect(() => formatDiffRow({ kind: 'nope' } as never)).toThrow(/unreachable/)
    applyTuiTheme('dark')
    expect(paintDiffLine('a.ts', 'a.ts')).toContain(rgb(TUI_COLOR.text))
    expect(paintDiffLine('- old', '- old')).toContain(rgb(TUI_COLOR.diffDel))
    expect(paintDiffLine('+ new', '+ new')).toContain(rgb(TUI_COLOR.diffAdd))
    expect(paintDiffLine('  keep', '  keep')).toContain(rgb(TUI_COLOR.muted))
    expect(paintDiffLine('└ +1 -0 · 1 file', '└ +1 -0 · 1 file')).toContain(rgb(TUI_COLOR.dim))
  })
})

function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `${String((n >> 16) & 255)};${String((n >> 8) & 255)};${String(n & 255)}`
}
