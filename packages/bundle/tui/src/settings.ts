/**
 * `/settings` overlay hub and its sub-panels. The hub is an `OverlayPicker`
 * whose rows are sub-panels; `app.ts` dispatches a confirmed row. Permission
 * reads the mounted `PermissionPresetService` and writes through `set`.
 * Models lists configurable providers and offers Set / Clear API key, Set /
 * Clear base URL, Set / Clear display name, plus Login; Inventory is a
 * read-only roster; Sections lists namespaces and, when a section has field
 * names, a name-only field picker.
 * @module @deepseek-ai/dsh-tui/settings
 */

import type { SelectItem, TUI } from '@oh-my-pi/pi-tui'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { CUSTOM_PRESET, type PresetOption } from '@deepseek-ai/dsh-permission-presets'
import { formatCwdForFooter, homeDir } from './chrome.ts'
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

/** Optional rows the `/settings` hub appends after the shipped panels. */
export interface SettingsHubOptions {
  /** `ctx.settings.documentPath` when the provider stores one local file. */
  documentPath?: string
  /** Process home used to render `~/…`; defaults to `HOME` / `USERPROFILE`. */
  home?: string
  /** True when `ctx.settings.describe` is available. */
  sections?: boolean
}

/** Hub rows for the /settings panels.
 * @param options - Settings file and Sections rows when those seams exist.
 * @returns Appearance, Models, Permission, Inventory, then Sections and Settings file when present.
 */
export function settingsHubRows(options: SettingsHubOptions = {}): SelectItem[] {
  return [
    { value: 'theme', label: 'Appearance', description: 'Terminal theme' },
    { value: 'models', label: 'Models', description: 'Configurable LLM providers' },
    { value: 'permission', label: 'Permission', description: 'Sandbox mode + approval policy preset' },
    { value: 'inventory', label: 'Inventory', description: 'Loaded plugins' },
    ...options.sections === true
      ? [{ value: 'sections', label: 'Sections', description: 'Registered settings namespaces' }]
      : [],
    ...options.documentPath === undefined || options.documentPath.length === 0
      ? []
      : [{
        value: 'file',
        label: 'Settings file',
        description: formatCwdForFooter(options.documentPath, options.home ?? homeDir()),
      }],
  ]
}

/** One top-level field on a registered settings namespace. */
export interface SettingsSectionField {
  /** Field name on the resolved section object. */
  readonly name: string
  /** True when the user layer names this key. */
  readonly overridden: boolean
}

/** One registered settings namespace, as a configuration surface reads it. */
export interface SettingsSectionEntry {
  /** Registered namespace id. */
  readonly ns: string
  /** Owner-declared effect timing (`live` or `restart`). */
  readonly applies: string
  /** True when a well-formed user layer exists for this namespace. */
  readonly overridden: boolean
  /** Top-level keys of the redacted resolved value, when any. */
  readonly fields?: readonly SettingsSectionField[]
}

/**
 * Top-level keys of a redacted resolved section, plus one-segment secret
 * slots. Names only — never values.
 * @param value - `describe({ redactSecrets: true }).value`.
 * @param user - the redacted user layer, when one exists.
 * @param secrets - `describe({ redactSecrets: true }).secrets`.
 * @returns sorted field rows.
 */
export function settingsSectionFields(
  value: unknown,
  user: unknown,
  secrets: readonly { path: readonly string[] }[] = [],
): SettingsSectionField[] {
  const names = new Set<string>()
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const name of Object.keys(value)) names.add(name)
  }
  for (const secret of secrets) {
    const name = secret.path[0]
    if (secret.path.length === 1 && name !== undefined) names.add(name)
  }
  if (names.size === 0) return []
  const userObj = typeof user === 'object' && user !== null && !Array.isArray(user)
    ? user as Record<string, unknown>
    : {}
  return [...names].sort().map(name => ({
    name,
    overridden: Object.prototype.hasOwnProperty.call(userObj, name),
  }))
}

/**
 * Field picker rows for one namespace. Description is `overridden` when the
 * user layer names that key.
 * @param fields - {@link settingsSectionFields} output.
 * @returns one row per field.
 */
export function settingsSectionFieldRows(fields: readonly SettingsSectionField[]): SelectItem[] {
  return fields.map(field => ({
    value: field.name,
    label: field.name,
    ...field.overridden ? { description: 'overridden' } : {},
  }))
}

/** The settings-describe surface; `ctx.settings` satisfies this structurally. */
export interface SettingsSectionSource {
  /** Registered namespaces in registration order. */
  sections(): Iterable<SettingsSectionEntry>
}

/**
 * Sections panel rows: one per registered namespace, in registration order.
 * Description is `applies` plus `overridden` when a user layer exists.
 * @param source - the settings service or a structural stand-in.
 * @returns one row per registered namespace.
 */
export function settingsSectionRows(source: SettingsSectionSource): SelectItem[] {
  const rows: SelectItem[] = []
  for (const section of source.sections()) {
    rows.push({
      value: section.ns,
      label: section.ns,
      description: section.overridden ? `${section.applies} · overridden` : section.applies,
    })
  }
  return rows
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
  /** Stored `baseURL` when the profile names one. */
  readonly baseURL?: string
  /** True when `credentials.describe` reports a configured reference. */
  readonly keyConfigured?: boolean
}

/** The LLM configurable-provider surface; `ctx.llm` satisfies this structurally. */
export interface ModelsSource {
  /** Configurable providers in declaration order. */
  providers(): Iterable<ModelsProviderEntry>
}

/**
 * Models roster description: settings namespace, `key` when a secret is
 * stored, and the profile `baseURL` when one is set. Never includes the key.
 * @param provider - one configurable provider.
 * @returns a ` · `-joined description.
 */
export function modelsRowDescription(provider: ModelsProviderEntry): string {
  const parts = [provider.settingsNs]
  if (provider.keyConfigured === true) parts.push('key')
  if (provider.baseURL !== undefined && provider.baseURL.length > 0) parts.push(provider.baseURL)
  return parts.join(' · ')
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
      description: modelsRowDescription(provider),
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
 * A string field on the stored profile at `path`.
 * @param section - the namespace's resolved section, or undefined when unset.
 * @param path - {@link ModelsProviderEntry.settingsPath}.
 * @param field - the profile key (`apiKeyEnv`, `baseURL`, `displayName`).
 * @returns the non-empty string, or undefined when absent.
 */
function profileStringOf(section: unknown, path: readonly string[], field: string): string | undefined {
  let current: unknown = section
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  if (typeof current !== 'object' || current === null) return undefined
  const value = (current as Record<string, unknown>)[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The `apiKeyEnv` a stored profile already names.
 * @param section - the namespace's resolved section, or undefined when unset.
 * @param path - {@link ModelsProviderEntry.settingsPath}.
 * @returns the reference, or undefined when the profile names none.
 */
export function apiKeyEnvOf(section: unknown, path: readonly string[]): string | undefined {
  return profileStringOf(section, path, 'apiKeyEnv')
}

/**
 * The `baseURL` a stored profile already names.
 * @param section - the namespace's resolved section, or undefined when unset.
 * @param path - {@link ModelsProviderEntry.settingsPath}.
 * @returns the endpoint, or undefined when the profile names none.
 */
export function baseUrlOf(section: unknown, path: readonly string[]): string | undefined {
  return profileStringOf(section, path, 'baseURL')
}

/**
 * The `displayName` a stored profile already names.
 * @param section - the namespace's resolved section, or undefined when unset.
 * @param path - {@link ModelsProviderEntry.settingsPath}.
 * @returns the label, or undefined when the profile names none.
 */
export function displayNameOf(section: unknown, path: readonly string[]): string | undefined {
  return profileStringOf(section, path, 'displayName')
}

/**
 * Why a typed base URL cannot be stored. An empty field is not a failure —
 * Escape cancels instead. Whitespace-only refuses; the settings schema is a
 * plain string, so this does not invent a URL-format rule.
 * @param draft - the submitted URL, untrimmed.
 * @returns a notice, or `undefined` when the URL can be stored.
 */
export function baseUrlRefusal(draft: string): string | undefined {
  if (draft.trim().length === 0) return 'base URL is blank'
  return undefined
}

/**
 * Why a typed display name cannot be stored. An empty field is not a failure —
 * Escape cancels instead. Whitespace-only refuses; `llm-pi-ai` rejects an
 * empty `displayName`, and the TUI does not invent a format rule.
 * @param draft - the submitted name, untrimmed.
 * @returns a notice, or `undefined` when the name can be stored.
 */
export function displayNameRefusal(draft: string): string | undefined {
  if (draft.trim().length === 0) return 'display name is blank'
  return undefined
}

/** Actions offered after a Models roster row is confirmed. */
export interface ProviderCredentialActions {
  /** Show Clear API key when a writable stored value exists. */
  readonly canClear: boolean
  /** Show Clear base URL when the stored profile names one. */
  readonly canClearBaseUrl: boolean
  /** Show Set display name when the profile is a nested settings object. */
  readonly canSetDisplayName: boolean
  /** Show Clear display name when the stored profile names one. */
  readonly canClearDisplayName: boolean
  /** Show Login when this route is a loginable OAuth provider. */
  readonly canLogin: boolean
}

/**
 * Per-provider credential, endpoint, and label actions. Set API key and Set
 * base URL are always present; display-name rows and Clear / Login appear
 * only when that write path exists.
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
  rows.push({ value: 'set-url', label: 'Set base URL', description: 'Override this provider endpoint' })
  if (actions.canClearBaseUrl) {
    rows.push({ value: 'clear-url', label: 'Clear base URL', description: 'Use the catalog endpoint' })
  }
  if (actions.canSetDisplayName) {
    rows.push({ value: 'set-name', label: 'Set display name', description: 'Override this provider label' })
  }
  if (actions.canClearDisplayName) {
    rows.push({ value: 'clear-name', label: 'Clear display name', description: 'Use the route id' })
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
