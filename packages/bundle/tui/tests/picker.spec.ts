/** Overlay picker used by /model and /theme. */

import { describe, expect, it } from 'vitest'
import { OverlayPicker } from '../src/picker.ts'
import type { SelectItem } from '@oh-my-pi/pi-tui'

describe('OverlayPicker', () => {
  it('renders a title and confirms or cancels the inner list', () => {
    const items: SelectItem[] = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta', description: 'second', hint: 'no key' },
    ]
    let selected: string | undefined
    let cancelled = false
    const picker = new OverlayPicker(
      'Model',
      items,
      'Esc close',
      {
        onSelect: (item) => { selected = item.value },
        onCancel: () => { cancelled = true },
      },
      'b',
    )
    picker.invalidate()
    const lines = picker.render(40)
    expect(lines.some(line => line.includes('Model'))).toBe(true)
    expect(lines.some(line => line.includes('Esc close'))).toBe(true)
    picker.handleInput('\x1b')
    expect(cancelled).toBe(true)
    const again = new OverlayPicker('Theme', items, 'hint', {
      onSelect: (item) => { selected = item.value },
      onCancel: () => {},
    })
    again.handleInput('\r')
    expect(selected).toBe('a')
  })
})
