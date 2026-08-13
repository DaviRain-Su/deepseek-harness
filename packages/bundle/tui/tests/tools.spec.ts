/** Tool-card mapping of presentCall / presentResult views. */

import { describe, expect, it } from 'vitest'
import { visibleWidth } from '@earendil-works/pi-tui'
import { ToolCard, linesForCall, linesForResult } from '../src/tools.ts'

describe('linesForCall', () => {
  it('formats generic, terminal, and diff pending cards', () => {
    expect(linesForCall({ card: 'generic', title: 'Read a' })).toEqual({ title: '● Read a', body: [] })
    expect(linesForCall({ card: 'generic', title: 'Grep', rawInput: '' })).toEqual({ title: '● Grep', body: [] })
    expect(linesForCall({ card: 'generic', title: 'Grep', rawInput: 'q' })).toEqual({ title: '● Grep', body: ['q'] })
    expect(linesForCall({ card: 'generic', title: 'Grep', rawInput: { q: 1 } })).toEqual({
      title: '● Grep', body: ['{"q":1}'],
    })
    expect(linesForCall({ card: 'terminal', title: 'ls' })).toEqual({ title: '❯ ls', body: [] })
    expect(linesForCall({ card: 'terminal', title: 'ls', description: 'list' })).toEqual({
      title: '❯ ls', body: ['list'],
    })
    expect(linesForCall({
      card: 'diff', title: 'Write a.ts', diffs: [{ path: 'a.ts', oldText: null, newText: 'x' }],
    })).toEqual({ title: '✎ Write a.ts', body: ['a.ts'] })
    expect(() => linesForCall({ card: 'nope' } as never)).toThrow(/unreachable/)
  })
})

describe('linesForResult', () => {
  it('keeps the pending title when the result omits a replacement', () => {
    expect(linesForResult('● x', undefined, '', false)).toEqual({ title: '● x', body: [] })
    expect(linesForResult('● x', undefined, 'raw', true)).toEqual({ title: 'error ● x', body: ['raw'] })
    expect(linesForResult('● x', { card: 'generic' }, '', false)).toEqual({ title: '● x', body: [] })
    expect(linesForResult('● x', { card: 'generic', title: 'Done' }, 'out', false)).toEqual({
      title: '● Done', body: ['out'],
    })
  })

  it('formats terminal, diff, search, read, and web completed cards', () => {
    expect(linesForResult('❯ ls', { card: 'terminal' }, '', false)).toEqual({ title: '❯ ls', body: [] })
    expect(linesForResult('❯ ls', { card: 'terminal', output: '' }, '', false)).toEqual({ title: '❯ ls', body: [] })
    expect(linesForResult('❯ ls', {
      card: 'terminal', title: 'ls -l', output: 'a', exitCode: 0, signal: 'SIGTERM',
    }, '', false)).toEqual({ title: '❯ ls -l', body: ['a', 'exit 0', 'SIGTERM'] })
    expect(linesForResult('✎ a', {
      card: 'diff', diffs: [{ path: 'a.ts', oldText: 'o', newText: 'n' }],
    }, '', false)).toEqual({ title: '✎ a', body: ['a.ts'] })
    expect(linesForResult('● g', {
      card: 'search', shape: 'matches', files: [{
        path: 'a.ts', matches: [{ lineNumber: 2, line: 'hit' }],
      }], truncated: false, total: 1,
    }, '', false).body).toEqual(['a.ts:2 hit'])
    expect(linesForResult('● g', {
      card: 'search', shape: 'matches', files: [], truncated: true, total: 9,
    }, '', false).body).toEqual(['truncated 9'])
    expect(linesForResult('● g', {
      card: 'search', shape: 'paths', paths: ['a.ts'], truncated: false, total: 1,
    }, '', false).body).toEqual(['a.ts'])
    expect(linesForResult('● g', {
      card: 'search', shape: 'paths', paths: ['a.ts'], truncated: true, total: 4,
    }, '', false).body).toEqual(['a.ts', 'truncated 4'])
    expect(linesForResult('● r', {
      card: 'read', path: 'a.ts', offset: 1, totalLines: 2, lines: [{ number: 1, text: 'x' }],
    }, '', false).body).toEqual(['a.ts', '1 x'])
    expect(linesForResult('● w', {
      card: 'web', kind: 'search', sources: [{ url: 'https://a.test' }, { url: 'https://b.test', title: 'B' }],
      truncated: false,
    }, '', false).body).toEqual(['https://a.test', 'B  https://b.test'])
    expect(linesForResult('● w', {
      card: 'web', kind: 'search', sources: [], answer: 'yes', truncated: true,
    }, '', false).body).toEqual(['yes', 'truncated'])
    expect(linesForResult('● w', {
      card: 'web', kind: 'fetch', url: 'https://a.test', statusCode: 200, truncated: false,
    }, '', false).body).toEqual(['200 https://a.test'])
    expect(linesForResult('● w', {
      card: 'web', kind: 'fetch', title: 'Fetched', url: 'https://a.test', statusCode: 404, truncated: true,
    }, '', true)).toEqual({ title: 'error ● Fetched', body: ['404 https://a.test', 'truncated'] })
    expect(() => linesForResult('● x', { card: 'nope' } as never, '', false)).toThrow(/unreachable/)
    expect(() => linesForResult('● g', { card: 'search', shape: 'nope' } as never, '', false)).toThrow(/unreachable/)
    expect(() => linesForResult('● w', { card: 'web', kind: 'nope' } as never, '', false)).toThrow(/unreachable/)
  })
})

describe('ToolCard', () => {
  it('wraps a title, caps a long body, and accepts a completed update', () => {
    const card = new ToolCard('● t', Array.from({ length: 12 }, (_, i) => `row-${String(i)}`))
    card.invalidate()
    const pending = card.render(20)
    expect(pending.some(line => line.includes('● t'))).toBe(true)
    expect(pending.some(line => line.includes('more'))).toBe(true)
    for (const line of pending) expect(visibleWidth(line)).toBeLessThanOrEqual(20)
    card.complete('● done', ['ok'])
    expect(card.render(20).join('\n')).toContain('ok')
    card.complete('error ● t', ['fail'], true)
    expect(card.render(20).join('\n')).toContain('error ● t')
    const failed = new ToolCard('● x', [], 'error')
    failed.invalidate()
    expect(failed.render(20).join('\n')).toContain('● x')
    expect(() => new ToolCard('● x', [], 'nope' as never).render(20)).toThrow(/unreachable/)
  })
})
