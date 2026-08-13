/** Fullscreen diff overlay: scroll keys, mouse wheel, and dismiss. */

import { describe, expect, it } from 'vitest'
import { DiffOverlay } from '../src/diff-overlay.ts'

describe('DiffOverlay', () => {
  it('paints the hunks, scrolls, and closes on escape', () => {
    let closed = 0
    const overlay = new DiffOverlay(
      '✎ Edit a.ts',
      [{ path: 'a.ts', oldText: 'old', newText: 'new' }],
      () => 12,
      { onClose: () => { closed += 1 } },
    )
    overlay.invalidate()
    const frame = overlay.render(40)
    expect(frame[0]).toContain('✎ Edit a.ts')
    expect(frame.some(line => line.includes('- old'))).toBe(true)
    expect(frame.some(line => line.includes('+ new'))).toBe(true)
    expect(frame.at(-1)).toContain('esc close')
    overlay.handleInput('\x1b[B')
    overlay.handleInput('\x1b[<64;1;1M')
    overlay.handleInput('\x1b[<65;1;1M')
    overlay.handleInput('x')
    expect(closed).toBe(0)
    overlay.handleInput('\x1b')
    expect(closed).toBe(1)
    overlay.handleInput('\x0f')
    overlay.handleInput('\x1bo')
    overlay.handleInput('\x03')
    expect(closed).toBe(4)
    expect(overlay.render(0).some(line => line.includes('a.ts'))).toBe(true)
  })
})
