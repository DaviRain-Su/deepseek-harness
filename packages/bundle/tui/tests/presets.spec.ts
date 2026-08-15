/** `/preset` picker rows and the blank-session lock. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLEAR_DEFAULT_PRESET, defaultPresetRows, presetPickerItem, sessionBlank } from '../src/presets.ts'

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
    expect(presetPickerItem({ id: 'code' }, 'code', 'default'))
      .toEqual({ value: 'code', label: 'code', description: 'default' })
    expect(presetPickerItem({ id: 'mine', broken: 'empty composition' }))
      .toEqual({
        value: 'mine',
        label: 'mine (broken)',
        description: 'broken: empty composition',
      })
  })
})

describe('defaultPresetRows', () => {
  it('omits broken presets and prepends Clear when the user layer names default', () => {
    expect(defaultPresetRows(
      [
        { id: 'standard', name: 'Standard' },
        { id: 'mine', broken: 'empty composition' },
        { id: 'code' },
      ],
      'standard',
      true,
    )).toEqual([
      { value: CLEAR_DEFAULT_PRESET, label: 'Clear default', description: 'Use the composition default' },
      { value: 'standard', label: 'Standard', description: 'standard · default' },
      { value: 'code', label: 'code' },
    ])
  })
})

describe('tui patch', () => {
  it('mounts the host runner the shipped cordis preset injects', () => {
    const patch = readFileSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
    expect(patch).toContain("name: '@deepseek-ai/dsh-cordis-host-runner'")
  })
})
