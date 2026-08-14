/**
 * `/settings` overlay hub and its sub-panels. The hub is an `OverlayPicker`
 * whose rows are sub-panels; `app.ts` dispatches a confirmed row. Permission
 * reads the mounted `PermissionPresetService` and writes through `set`.
 * Models lists configurable providers and offers Set / Clear API key plus
 * Login; Inventory is a read-only roster.
 * @module @deepseek-ai/dsh-tui/settings
 */

import type { SelectItem, TUI } from '@oh-my-pi/pi-tui'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { CUSTOM_PRESET, type PresetOption } from '@deepseek-ai/dsh-permission-presets'
import { OverlayPicker, showPicker } from './picker.ts'

/**
 * The preset surface the hub reads; the mounted `PermissionPresetService`
 * satisfies this structurally. Declared locally so the pure builders test
 * without the service class.
 */
export interface PermissionPresetSource {
  /** Preset names in the table's declaration order. */
  readonly names: readonly string[]
  /** Effective preset for a session's event log, or `custom` when none matches. */
  current(events: readonly SessionEvent[]): string
  /** The client option for a table entry or `custom`. */
  optionOf(name: string): PresetOption
  /** Record a switch and write the sandbox/approval knobs through the session. */
  set(session: Session, name: string): void
}

/** Hub rows for the /settings panels.
 * @returns the Appearance, Models, Permission, and Inventory rows.
 */
export function settingsHubRows(): SelectItem[] {
  return [
    { value: 'theme', label: 'Appearance', description: 'Terminal theme' },
    { value: 'models', label: 'Models', description: 'Configurable LLM providers' },
    { value: 'permission', label: 'Permission', description: 'Sandbox mode + approval policy preset' },
    { value: 'inventory', label: 'Inventory', description: 'Loaded plugins' },
  ]
}

/** One loaded plugin entry, as a configuration surface reads it. */
export interface PluginInventoryEntry {
  /** Full path id within the loader entry tree. */
  id: string
  /** Module specifier the loader imported for this entry. */
  name: string
  /** Whether this entry and its descendants are prevented from running. */
  disabled: boolean
}

/** The loader surface the hub reads; `ctx.loader` satisfies this structurally. */
export interface PluginInventorySource {
  /** Loaded plugin entries in loader order. */
  entries(): Iterable<PluginInventoryEntry>
}

/**
 * Inventory rows for the loaded plugin entries, in loader order. A disabled
 * entry is marked; a missing description is omitted.
 * @param source - the loader or a structural stand-in.
 * @returns one row per loaded plugin entry.
 */
export function inventoryRows(source: PluginInventorySource): SelectItem[] {
  const rows: SelectItem[] = []
  for (const entry of source.entries()) {
    rows.push({
      value: entry.id,
      label: entry.name,
      ...entry.disabled ? { description: 'disabled' } : {},
    })
  }
  return rows
}

/** One configurable LLM provider, as a configuration surface reads it. */
export interface ModelsProviderEntry {
  /** Provider route key. */
  readonly provider: string
  /** Human-facing display name. */
  readonly displayName: string
  /** Settings namespace the provider configures under. */
  readonly settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile;
   * empty when the whole section is the profile.
   */
  readonly settingsPath?: readonly string[]
}

/** The LLM configurable-provider surface; `ctx.llm` satisfies this structurally. */
export interface ModelsSource {
  /** Configurable providers in declaration order. */
  providers(): Iterable<ModelsProviderEntry>
}

/**
 * Models panel rows: one per configurable provider, in declaration order.
 * @param source - the LLM runtime or a structural stand-in.
 * @returns one row per configurable provider.
 */
export function modelsRows(source: ModelsSource): SelectItem[] {
  const rows: SelectItem[] = []
  for (const provider of source.providers()) {
    rows.push({
      value: provider.provider,
      label: provider.displayName,
      description: provider.settingsNs,
    })
  }
  return rows
}

/**
 * Conventional credential reference for a provider route. The TUI never asks
 * for an environment-variable name; a typed key stores under this derivation
 * and the profile records it as `apiKeyEnv` when the profile names none.
 * @param provider - provider route id (e.g. `anthropic`, `minimax-cn`).
 * @returns the derived reference name (e.g. `MINIMAX_CN_API_KEY`).
 */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** Twin of the Web Models page's printable-ASCII key rule (space excluded). */
const LEGAL_API_KEY = /^[\x21-\x7E]+$/

/**
 * Why a typed API key cannot be stored. An empty field is not a failure —
 * Escape cancels instead. Whitespace-only and illegal characters refuse.
 * @param draft - the submitted key, untrimmed.
 * @returns a notice, or `undefined` when the key can be stored.
 */
export function apiKeyRefusal(draft: string): string | undefined {
  const value = draft.trim()
  if (value.length === 0) return 'API key is blank'
  if (!LEGAL_API_KEY.test(value)) return 'API key has illegal characters'
  return undefined
}

/**
 * The `apiKeyEnv` a stored profile already names.
 * @param section - the namespace's resolved section, or undefined when unset.
 * @param path - {@link ModelsProviderEntry.settingsPath}.
 * @returns the reference, or undefined when the profile names none.
 */
export function apiKeyEnvOf(section: unknown, path: readonly string[]): string | undefined {
  let current: unknown = section
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  if (typeof current !== 'object' || current === null) return undefined
  const ref = (current as { apiKeyEnv?: unknown }).apiKeyEnv
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

/** Actions offered after a Models roster row is confirmed. */
export interface ProviderCredentialActions {
  /** Show Clear API key when a writable stored value exists. */
  readonly canClear: boolean
  /** Show Login when this route is a loginable OAuth provider. */
  readonly canLogin: boolean
}

/**
 * Per-provider credential actions. Set API key is always first; Clear and
 * Login appear only when that write path exists.
 * @param actions - which optional rows to include.
 * @returns rows in declaration order.
 */
export function providerCredentialRows(actions: ProviderCredentialActions): SelectItem[] {
  const rows: SelectItem[] = [
    { value: 'set-key', label: 'Set API key', description: 'Store a key for this provider' },
  ]
  if (actions.canClear) {
    rows.push({ value: 'clear-key', label: 'Clear API key', description: 'Remove the stored key' })
  }
  if (actions.canLogin) {
    rows.push({ value: 'login', label: 'Log in', description: 'Subscription OAuth' })
  }
  return rows
}

/**
 * Permission picker rows: every preset in declaration order, then a `custom`
 * row exactly when the effective knobs match no preset. A missing description
 * is omitted so the picker renders a clean line.
 * @param source - the mounted preset service.
 * @param events - the session's event log.
 * @returns rows in table order, with `custom` appended when derived.
 */
export function permissionPresetRows(source: PermissionPresetSource, events: readonly SessionEvent[]): SelectItem[] {
  const toRow = (option: PresetOption): SelectItem => ({
    value: option.value,
    label: option.name,
    ...option.description !== undefined ? { description: option.description } : {},
  })
  const rows = source.names.map(name => toRow(source.optionOf(name)))
  if (source.current(events) === CUSTOM_PRESET) rows.push(toRow(source.optionOf(CUSTOM_PRESET)))
  return rows
}

/** Visible overlay handle the session owns for the Permission picker's lifetime. */
export interface SettingsOverlayHandle {
  /** Hide the overlay and settle as cancelled. */
  hide(): void
}

/** Optional overlay lifetime hooks for the owning TUI session. */
interface SettingsPermissionHooks {
  /** The overlay is visible; the owner may record the handle. */
  onOpen?: (handle: SettingsOverlayHandle) => void
  /** The overlay has been hidden after a decision or dismiss. */
  onClose?: () => void
}

/**
 * Open the Permission preset picker. Confirming a table entry writes it
 * through `source.set`; the `custom` row closes without writing. Escape or an
 * external hide settles `undefined` with no write. The current preset is
 * preselected.
 * @param tui - the live renderer that owns overlay focus.
 * @param source - the mounted preset service.
 * @param session - the session the switch belongs to.
 * @param hooks - optional open/close notifications for the session owner.
 * @returns the confirmed preset name, or `undefined` on cancel.
 */
export function promptPermissionPreset(
  tui: TUI,
  source: PermissionPresetSource,
  session: Session,
  hooks?: SettingsPermissionHooks,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false
    // eslint-disable-next-line prefer-const -- assigned after showPicker below; settle closes over it before that point.
    let overlay: SettingsOverlayHandle | undefined
    const settle = (name: string | undefined): void => {
      if (settled) return
      settled = true
      overlay?.hide()
      hooks?.onClose?.()
      resolve(name)
    }
    const picker = new OverlayPicker(
      'Permission preset',
      permissionPresetRows(source, session.events),
      'Switch the sandbox mode + approval policy bundle',
      {
        onSelect: (item) => {
          if (item.value === CUSTOM_PRESET) { settle(undefined); return }
          source.set(session, item.value)
          settle(item.value)
        },
        onCancel: () => { settle(undefined) },
      },
      source.current(session.events),
    )
    const handle = showPicker(tui, picker)
    overlay = { hide: () => { handle.hide(); settle(undefined) } }
    hooks?.onOpen?.(overlay)
  })
}
