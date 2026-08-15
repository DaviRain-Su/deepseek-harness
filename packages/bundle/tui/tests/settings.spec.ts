/** `/settings` hub rows, Permission preset rows, and the preset picker overlay. */

import { describe, expect, it } from 'vitest'
import type { TUI } from '@oh-my-pi/pi-tui'
import type { Session } from '@deepseek-ai/dsh-session'
import { CUSTOM_PRESET, type PresetOption } from '@deepseek-ai/dsh-permission-presets'
import { OverlayPicker } from '../src/picker.ts'
import {
  apiKeyEnvOf,
  apiKeyRefusal,
  baseUrlOf,
  baseUrlRefusal,
  displayNameOf,
  displayNameRefusal,
  deriveKeyRef,
  inventoryRows,
  modelsRowDescription,
  modelsRows,
  permissionPresetRows,
  promptPermissionPreset,
  providerCredentialRows,
  settingsHubRows,
  settingsSectionFieldRows,
  settingsSectionFields,
  settingsSectionRows,
  webSearchKeyRef,
  WEB_SEARCH_DEFAULT_KEY_REF,
  positiveIntRefusal,
  shellActionRows,
  agentLoopActionRows,
  userNamesField,
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
  it('lists the shipped panels and appends Agent preset, Sections, and Settings file when those seams exist', () => {
    expect(settingsHubRows().map(row => row.value)).toEqual(['theme', 'models', 'permission', 'inventory'])
    expect(settingsHubRows({ webSearch: true }).map(row => row.value))
      .toEqual(['theme', 'models', 'web-search', 'permission', 'inventory'])
    expect(settingsHubRows({ shell: true }).map(row => row.value))
      .toEqual(['theme', 'models', 'shell', 'permission', 'inventory'])
    expect(settingsHubRows({ agentLoop: true }).map(row => row.value))
      .toEqual(['theme', 'models', 'agent-loop', 'permission', 'inventory'])
    expect(settingsHubRows({ presets: true }).map(row => row.value))
      .toEqual(['theme', 'models', 'permission', 'preset', 'inventory'])
    expect(settingsHubRows({ sections: true }).map(row => row.value))
      .toEqual(['theme', 'models', 'permission', 'inventory', 'sections'])
    expect(settingsHubRows({ documentPath: '/tmp/dsh/settings.yaml', home: '/tmp' }).at(-1)).toEqual({
      value: 'file',
      label: 'Settings file',
      description: '~/dsh/settings.yaml',
    })
  })
})

describe('settingsSectionRows', () => {
  it('maps each registered namespace in order and marks a user layer', () => {
    const rows = settingsSectionRows({
      sections: () => [
        { ns: 'tui-theme', applies: 'live', overridden: true },
        { ns: 'llm-pi-ai', applies: 'restart', overridden: false },
      ],
    })
    expect(rows.map(row => row.value)).toEqual(['tui-theme', 'llm-pi-ai'])
    expect(rows[0]).toEqual({ value: 'tui-theme', label: 'tui-theme', description: 'live · overridden' })
    expect(rows[1]).toEqual({ value: 'llm-pi-ai', label: 'llm-pi-ai', description: 'restart' })
  })

  it('returns an empty list when nothing is registered', () => {
    expect(settingsSectionRows({ sections: () => [] })).toEqual([])
  })
})

describe('settingsSectionFields', () => {
  it('sorts redacted value keys and one-segment secret slots', () => {
    expect(settingsSectionFields(
      { theme: 'dark', reasoning: 'low' },
      { theme: 'dark' },
      [{ path: ['apiKey'] }, { path: ['retry', 'token'] }],
    )).toEqual([
      { name: 'apiKey', overridden: false },
      { name: 'reasoning', overridden: false },
      { name: 'theme', overridden: true },
    ])
  })

  it('returns an empty list when the value is not a plain object and no top-level secrets exist', () => {
    expect(settingsSectionFields(undefined, undefined)).toEqual([])
    expect(settingsSectionFields(['x'], undefined, [{ path: ['nested', 'key'] }])).toEqual([])
  })
})

describe('settingsSectionFieldRows', () => {
  it('marks a user-layer key as overridden', () => {
    expect(settingsSectionFieldRows([
      { name: 'theme', overridden: true },
      { name: 'apiKey', overridden: false },
    ])).toEqual([
      { value: 'theme', label: 'theme', description: 'overridden' },
      { value: 'apiKey', label: 'apiKey' },
    ])
  })
})

describe('modelsRowDescription', () => {
  it('joins the namespace with a key source and base URL when present', () => {
    expect(modelsRowDescription({ provider: 'xai', displayName: 'xAI', settingsNs: 'llm-pi-ai' }))
      .toBe('llm-pi-ai')
    expect(modelsRowDescription({
      provider: 'xai', displayName: 'xAI', settingsNs: 'llm-pi-ai',
      keyConfigured: true, baseURL: 'https://proxy.example/v1',
    })).toBe('llm-pi-ai · key · https://proxy.example/v1')
    expect(modelsRowDescription({
      provider: 'xai', displayName: 'xAI', settingsNs: 'llm-pi-ai',
      keyConfigured: true, keySource: 'file', baseURL: 'https://proxy.example/v1',
    })).toBe('llm-pi-ai · file · https://proxy.example/v1')
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

describe('deriveKeyRef', () => {
  it('derives a POSIX identifier from the route id', () => {
    expect(deriveKeyRef('anthropic')).toBe('ANTHROPIC_API_KEY')
    expect(deriveKeyRef('minimax-cn')).toBe('MINIMAX_CN_API_KEY')
  })
})

describe('apiKeyRefusal', () => {
  it('refuses blank and illegal keys', () => {
    expect(apiKeyRefusal('  ')).toBe('API key is blank')
    expect(apiKeyRefusal('has space')).toBe('API key has illegal characters')
    expect(apiKeyRefusal('sk-ok')).toBeUndefined()
  })
})

describe('apiKeyEnvOf', () => {
  it('walks the settings path to the named reference', () => {
    expect(apiKeyEnvOf({ providers: { xai: { apiKeyEnv: 'XAI_API_KEY' } } }, ['providers', 'xai']))
      .toBe('XAI_API_KEY')
    expect(apiKeyEnvOf({ apiKeyEnv: 'DEEPSEEK_API_KEY' }, [])).toBe('DEEPSEEK_API_KEY')
    expect(apiKeyEnvOf({}, ['providers', 'xai'])).toBeUndefined()
  })
})

describe('webSearchKeyRef', () => {
  it('uses the section apiKeyEnv and otherwise the DeepSeek default', () => {
    expect(webSearchKeyRef({ apiKeyEnv: 'SEARCH_KEY' })).toBe('SEARCH_KEY')
    expect(webSearchKeyRef({})).toBe(WEB_SEARCH_DEFAULT_KEY_REF)
    expect(webSearchKeyRef(undefined)).toBe(WEB_SEARCH_DEFAULT_KEY_REF)
  })
})

describe('positiveIntRefusal', () => {
  it('refuses blank, zero, and non-digits, and accepts a positive integer', () => {
    expect(positiveIntRefusal('  ', 'timeoutMs')).toBe('timeoutMs is blank')
    expect(positiveIntRefusal('0', 'timeoutMs')).toBe('timeoutMs must be a positive integer')
    expect(positiveIntRefusal('12.5', 'timeoutMs')).toBe('timeoutMs must be a positive integer')
    expect(positiveIntRefusal('5000', 'timeoutMs')).toBeUndefined()
  })
})

describe('userNamesField', () => {
  it('is true only when the user layer owns that key', () => {
    expect(userNamesField({ timeoutMs: 5_000 }, 'timeoutMs')).toBe(true)
    expect(userNamesField({}, 'timeoutMs')).toBe(false)
    expect(userNamesField(undefined, 'timeoutMs')).toBe(false)
  })
})

describe('shellActionRows', () => {
  it('always offers Set timeout and Set output cap, and appends Clear when the user layer names that field', () => {
    expect(shellActionRows({ canClearTimeout: false, canClearOutput: false }).map(row => row.value))
      .toEqual(['set-timeout', 'set-output'])
    expect(shellActionRows({ canClearTimeout: true, canClearOutput: true }).map(row => row.value))
      .toEqual(['set-timeout', 'clear-timeout', 'set-output', 'clear-output'])
  })
})

describe('agentLoopActionRows', () => {
  it('always offers Set parallel cap and appends Clear when the user layer names it', () => {
    expect(agentLoopActionRows(false).map(row => row.value)).toEqual(['set-parallel'])
    expect(agentLoopActionRows(true).map(row => row.value)).toEqual(['set-parallel', 'clear-parallel'])
  })
})

describe('baseUrlOf', () => {
  it('walks the settings path to the named endpoint', () => {
    expect(baseUrlOf({ providers: { xai: { baseURL: 'https://api.x.ai/v1' } } }, ['providers', 'xai']))
      .toBe('https://api.x.ai/v1')
    expect(baseUrlOf({ baseURL: 'https://api.deepseek.com' }, [])).toBe('https://api.deepseek.com')
    expect(baseUrlOf({}, ['providers', 'xai'])).toBeUndefined()
  })
})

describe('baseUrlRefusal', () => {
  it('refuses a blank URL and accepts any non-empty string', () => {
    expect(baseUrlRefusal('  ')).toBe('base URL is blank')
    expect(baseUrlRefusal('https://proxy.example/v1')).toBeUndefined()
  })
})

describe('displayNameOf', () => {
  it('walks the settings path to the named label', () => {
    expect(displayNameOf({ providers: { xai: { displayName: 'xAI' } } }, ['providers', 'xai']))
      .toBe('xAI')
    expect(displayNameOf({ displayName: 'DeepSeek' }, [])).toBe('DeepSeek')
    expect(displayNameOf({}, ['providers', 'xai'])).toBeUndefined()
  })
})

describe('displayNameRefusal', () => {
  it('refuses a blank name and accepts any non-empty string', () => {
    expect(displayNameRefusal('  ')).toBe('display name is blank')
    expect(displayNameRefusal('Acme Gateway')).toBeUndefined()
  })
})

describe('providerCredentialRows', () => {
  it('always offers Set API key and Set base URL, and appends display-name, Clear, and Login when available', () => {
    expect(providerCredentialRows({
      canClear: false, canClearBaseUrl: false, canSetDisplayName: false, canClearDisplayName: false, canLogin: false,
    }).map(row => row.value))
      .toEqual(['set-key', 'set-url'])
    expect(providerCredentialRows({
      canClear: true, canClearBaseUrl: true, canSetDisplayName: true, canClearDisplayName: true, canLogin: true,
    }).map(row => row.value))
      .toEqual(['set-key', 'clear-key', 'set-url', 'clear-url', 'set-name', 'clear-name', 'login'])
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
