/** `/preset` picker rows and the blank-session lock. */

import { describe, expect, it } from 'vitest'
import { presetPickerItem, sessionBlank } from '../src/presets.ts'

describe('sessionBlank', () => {
  it('is blank until a turn starts', () => {
    expect(sessionBlank({ events: [] })).toBe(true)
    expect(sessionBlank({ events: [{ type: 'command/run' }] })).toBe(true)
    expect(sessionBlank({ events: [{ type: 'turn/start' }] })).toBe(false)
  })
})

describe('presetPickerItem', () => {
  it('labels the display name and marks current and broken rows', () => {
    expect(presetPickerItem({ id: 'standard', name: 'Standard', description: 'Full coding agent' }))
      .toEqual({
        value: 'standard',
        label: 'Standard',
        description: 'standard · Full coding agent',
      })
    expect(presetPickerItem({ id: 'standard' }, 'standard'))
      .toEqual({ value: 'standard', label: 'standard', description: 'current' })
    expect(presetPickerItem({ id: 'mine', broken: 'empty composition' }))
      .toEqual({
        value: 'mine',
        label: 'mine (broken)',
        description: 'broken: empty composition',
      })
  })
})
