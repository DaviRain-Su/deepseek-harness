/** `/settings` hub rows, Permission preset rows, and the preset picker overlay. */

import { describe, expect, it } from 'vitest'
import type { TUI } from '@oh-my-pi/pi-tui'
import type { Session } from '@deepseek-ai/dsh-session'
import { CUSTOM_PRESET, type PresetOption } from '@deepseek-ai/dsh-permission-presets'
import { OverlayPicker } from '../src/picker.ts'
import {
  inventoryRows,
  modelsRows,
  permissionPresetRows,
  promptPermissionPreset,
  settingsHubRows,
  type PermissionPresetSource,
  type PluginInventorySource,
  type SettingsOverlayHandle,
} from '../src/settings.ts'

function fakeTui(): { tui: TUI; pickers: OverlayPicker[]; hidden: number } {
  const pickers: OverlayPicker[] = []
  let hidden = 0
  const tui = {
    showOverlay: (component: OverlayPicker) => {
      pickers.push(component)
      return { hide: () => { hidden += 1 } }
    },
  } as unknown as TUI
  return { tui, pickers, get hidden() { return hidden } }
}

function fakeSource(overrides: Partial<{
  names: readonly string[]
  current: string
  options: Record<string, PresetOption>
}> = {}): { source: PermissionPresetSource; setCalls: string[] } {
  const setCalls: string[] = []
  const names = overrides.names ?? ['read-only', 'workspace-write']
  const options = overrides.options ?? {
    'read-only': { value: 'read-only', name: 'Read only', description: 'No filesystem writes' },
    'workspace-write': { value: 'workspace-write', name: 'Workspace write' },
  }
  const current = overrides.current ?? 'read-only'
  const source: PermissionPresetSource = {
    names,
    current: () => current,
    optionOf: name => options[name] ?? { value: name, name },
    set: (_session, name) => { setCalls.push(name) },
  }
  return { source, setCalls }
}

function fakeSession(): Session {
  return { events: [] } as unknown as Session
}

describe('settingsHubRows', () => {
  it('lists the shipped panels', () => {
    expect(settingsHubRows().map(row => row.value)).toEqual(['theme', 'models', 'permission', 'inventory'])
  })
})

describe('modelsRows', () => {
  it('maps each configurable provider to a row in declaration order', () => {
    const rows = modelsRows({
      providers: () => [
        { provider: 'openai', displayName: 'OpenAI', settingsNs: 'openai' },
        { provider: 'xai', displayName: 'xAI', settingsNs: 'xai' },
      ],
    })
    expect(rows.map(row => row.value)).toEqual(['openai', 'xai'])
    expect(rows[0]).toEqual({ value: 'openai', label: 'OpenAI', description: 'openai' })
  })

  it('returns an empty list when nothing is configurable', () => {
    expect(modelsRows({ providers: () => [] })).toEqual([])
  })
})

describe('inventoryRows', () => {
  function fakeSource(entries: ReadonlyArray<{ id: string; name: string; disabled: boolean }>): PluginInventorySource {
    return { entries: () => entries }
  }

  it('maps each loaded entry to a row in loader order', () => {
    const rows = inventoryRows(fakeSource([
      { id: 'dsh-session', name: '@deepseek-ai/dsh-session', disabled: false },
      { id: 'dsh-shell', name: '@deepseek-ai/dsh-shell', disabled: false },
    ]))
    expect(rows.map(row => row.value)).toEqual(['dsh-session', 'dsh-shell'])
    expect(rows[0]?.label).toBe('@deepseek-ai/dsh-session')
  })

  it('marks a disabled entry and omits the marker when enabled', () => {
    const rows = inventoryRows(fakeSource([
      { id: 'on', name: '@deepseek-ai/dsh-on', disabled: false },
      { id: 'off', name: '@deepseek-ai/dsh-off', disabled: true },
    ]))
    expect(rows[0]?.description).toBeUndefined()
    expect(rows[1]?.description).toBe('disabled')
  })

  it('returns an empty list when nothing is loaded', () => {
    expect(inventoryRows(fakeSource([]))).toEqual([])
  })
})

describe('permissionPresetRows', () => {
  it('orders rows by the table declaration', () => {
    const { source } = fakeSource()
    expect(permissionPresetRows(source, []).map(row => row.value)).toEqual(['read-only', 'workspace-write'])
  })

  it('omits a missing description', () => {
    const { source } = fakeSource()
    const rows = permissionPresetRows(source, [])
    expect(rows.find(row => row.value === 'workspace-write')?.description).toBeUndefined()
    expect(rows.find(row => row.value === 'read-only')?.description).toBe('No filesystem writes')
  })

  it('appends a custom row only when the effective knobs match no preset', () => {
    const custom = fakeSource({
      names: ['read-only'],
      current: CUSTOM_PRESET,
      options: { 'read-only': { value: 'read-only', name: 'Read only' } },
    })
    expect(permissionPresetRows(custom.source, []).map(row => row.value)).toEqual(['read-only', CUSTOM_PRESET])

    const matched = fakeSource({ names: ['read-only'], current: 'read-only' })
    expect(permissionPresetRows(matched.source, []).map(row => row.value)).toEqual(['read-only'])
  })
})

describe('promptPermissionPreset', () => {
  it('writes the confirmed preset and hides the overlay', async () => {
    const shown = fakeTui()
    const { source, setCalls } = fakeSource()
    const pending = promptPermissionPreset(shown.tui, source, fakeSession())
    shown.pickers[0]?.handleInput('\r')
    await expect(pending).resolves.toBe('read-only')
    expect(setCalls).toEqual(['read-only'])
    expect(shown.hidden).toBe(1)
  })

  it('does not write when the custom row is confirmed', async () => {
    const shown = fakeTui()
    const { source, setCalls } = fakeSource({ current: CUSTOM_PRESET })
    const pending = promptPermissionPreset(shown.tui, source, fakeSession())
    shown.pickers[0]?.handleInput('\r')
    await expect(pending).resolves.toBeUndefined()
    expect(setCalls).toEqual([])
    expect(shown.hidden).toBe(1)
  })

  it('cancels on escape without writing', async () => {
    const shown = fakeTui()
    const { source, setCalls } = fakeSource()
    const pending = promptPermissionPreset(shown.tui, source, fakeSession())
    shown.pickers[0]?.handleInput('\x1b')
    await expect(pending).resolves.toBeUndefined()
    expect(setCalls).toEqual([])
    expect(shown.hidden).toBe(1)
  })

  it('cancels on an external hide', async () => {
    const shown = fakeTui()
    const { source, setCalls } = fakeSource()
    const opened: SettingsOverlayHandle[] = []
    const pending = promptPermissionPreset(shown.tui, source, fakeSession(), { onOpen: (handle) => { opened.push(handle) } })
    opened[0]?.hide()
    await expect(pending).resolves.toBeUndefined()
    expect(setCalls).toEqual([])
  })

  it('selects the named row when the current preset is custom', async () => {
    const shown = fakeTui()
    const { source, setCalls } = fakeSource({
      names: ['read-only'],
      current: CUSTOM_PRESET,
      options: { 'read-only': { value: 'read-only', name: 'Read only' } },
    })
    const pending = promptPermissionPreset(shown.tui, source, fakeSession())
    shown.pickers[0]?.handleInput('\x1b[A')
    shown.pickers[0]?.handleInput('\r')
    await expect(pending).resolves.toBe('read-only')
    expect(setCalls).toEqual(['read-only'])
  })
})
