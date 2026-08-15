/**
 * `/settings` overlay hub and its sub-panels. The hub is an `OverlayPicker`
 * whose rows are sub-panels; `app.ts` dispatches a confirmed row. Permission
 * reads the mounted `PermissionPresetService` and writes through `set`.
 * Models lists configurable providers and offers Set / Clear API key, Set /
 * Clear base URL, Set / Clear display name, plus Login; Web search writes the
 * DeepSeek search key, endpoint, and `maxUses` when that namespace is registered; Shell
 * writes `timeoutMs` and `maxOutputBytes` when that namespace is registered;
 * Agent loop writes `maxParallelToolCalls` when that namespace is registered;
 * Agent preset reuses
 * `/preset` when the roster is mounted; Default preset writes
 * `agent-presets.default`; Inventory is a read-only roster;
 * Sections lists namespaces and, when a section has field names, a name-only
 * field picker.
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
  /** True when `ctx.agentPresets` is mounted. */
  presets?: boolean
  /** True when `describe()` lists the DeepSeek search namespace. */
  webSearch?: boolean
  /** True when `describe()` lists the `shell` namespace. */
  shell?: boolean
  /** True when `describe()` lists the `agent-loop` namespace. */
  agentLoop?: boolean
}

/** Settings namespace of the standing default agent preset. */
export const AGENT_PRESET_SETTINGS_NS = 'agent-presets'

/** Settings namespace of the DeepSeek search provider. */
export const WEB_SEARCH_SETTINGS_NS = 'web-search-deepseek'

/** Per-request search-use cap field on the DeepSeek search section. */
export const WEB_SEARCH_MAX_USES_FIELD = 'maxUses'

/** Credential reference the search provider resolves when the section names none. */
export const WEB_SEARCH_DEFAULT_KEY_REF = 'DEEPSEEK_API_KEY'

/** Settings namespace of the shell capability. */
export const SHELL_SETTINGS_NS = 'shell'

/** Foreground command timeout field on the `shell` section. */
export const SHELL_TIMEOUT_FIELD = 'timeoutMs'

/** Per-stream output cap field on the `shell` section. */
export const SHELL_OUTPUT_FIELD = 'maxOutputBytes'

/** Settings namespace of the agent loop's user-owned knobs. */
export const AGENT_LOOP_SETTINGS_NS = 'agent-loop'

/** Parallel tool-call cap field on the `agent-loop` section. */
export const AGENT_LOOP_PARALLEL_FIELD = 'maxParallelToolCalls'

/** Hub rows for the /settings panels.
 * @param options - Settings file, Agent preset, Default preset, Web search, Shell, Agent loop, and Sections rows when those seams exist.
 * @returns Appearance, Models, then optional Web search, Shell, Agent loop,
 *   Permission, Agent preset, Default preset, Inventory, Sections, and Settings file.
 */
export function settingsHubRows(options: SettingsHubOptions = {}): SelectItem[] {
  return [
    { value: 'theme', label: 'Appearance', description: 'Terminal theme' },
    { value: 'models', label: 'Models', description: 'Configurable LLM providers' },
    ...options.webSearch === true
      ? [{ value: 'web-search', label: 'Web search', description: 'DeepSeek search key and endpoint' }]
      : [],
    ...options.shell === true
      ? [{ value: 'shell', label: 'Shell', description: 'Foreground timeout and output cap' }]
      : [],
    ...options.agentLoop === true
      ? [{ value: 'agent-loop', label: 'Agent loop', description: 'Parallel tool-call cap' }]
      : [],
    { value: 'permission', label: 'Permission', description: 'Sandbox mode + approval policy preset' },
    ...options.presets === true
      ? [
        { value: 'preset', label: 'Agent preset', description: 'This session, while blank' },
        { value: 'default-preset', label: 'Default preset', description: 'New sessions use this' },
      ]
      : [],
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
  /** `credentials.describe` source layer when a key is configured. */
  readonly keySource?: string
}

/** The LLM configurable-provider surface; `ctx.llm` satisfies this structurally. */
export interface ModelsSource {
  /** Configurable providers in declaration order. */
  providers(): Iterable<ModelsProviderEntry>
}

/**
 * Models roster description: settings namespace, the credential source
 * (`file` / `env` / …) or `key` when a secret is stored, and the profile
 * `baseURL` when one is set. Never includes the secret.
 * @param provider - one configurable provider.
 * @returns a ` · `-joined description.
 */
export function modelsRowDescription(provider: ModelsProviderEntry): string {
  const parts = [provider.settingsNs]
  if (provider.keyConfigured === true) {
    parts.push(provider.keySource !== undefined && provider.keySource.length > 0
      ? provider.keySource
      : 'key')
  }
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
 * Credential reference the DeepSeek search provider resolves. The section's
 * `apiKeyEnv` wins; otherwise {@link WEB_SEARCH_DEFAULT_KEY_REF}. Never
 * derives a `WEB_SEARCH_DEEPSEEK_API_KEY` name.
 * @param section - `settings.get(web-search-deepseek)`, or undefined.
 * @returns a POSIX identifier.
 */
export function webSearchKeyRef(section: unknown): string {
  return apiKeyEnvOf(section, []) ?? WEB_SEARCH_DEFAULT_KEY_REF
}

/**
 * Whether the redacted user layer names this top-level field.
 * @param user - `describe().user` for one namespace.
 * @param field - the section key.
 * @returns true when the user layer owns that key.
 */
export function userNamesField(user: unknown, field: string): boolean {
  return typeof user === 'object' && user !== null && !Array.isArray(user)
    && Object.prototype.hasOwnProperty.call(user, field)
}

/**
 * Why a typed positive integer cannot be stored. An empty field is not a
 * failure — Escape cancels instead. Non-digits and zero refuse; the shell
 * schema is a positive integer, so this does not invent a maximum.
 * @param draft - the submitted digits, untrimmed.
 * @param field - the section key used in the notice (`timeoutMs`).
 * @returns a notice, or `undefined` when the integer can be stored.
 */
export function positiveIntRefusal(draft: string, field: string): string | undefined {
  const value = draft.trim()
  if (value.length === 0) return `${field} is blank`
  if (!/^[1-9][0-9]*$/.test(value)) return `${field} must be a positive integer`
  if (!Number.isSafeInteger(Number(value))) return `${field} must be a positive integer`
  return undefined
}

/** Optional Clear rows on the Shell picker. */
export interface ShellFieldActions {
  /** Show Clear timeout when the user layer names `timeoutMs`. */
  readonly canClearTimeout: boolean
  /** Show Clear output cap when the user layer names `maxOutputBytes`. */
  readonly canClearOutput: boolean
}

/**
 * Shell number-field actions. Set timeout and Set output cap are always
 * present; Clear appears when the user layer names that field.
 * @param actions - which Clear rows to include.
 * @returns rows in declaration order.
 */
export function shellActionRows(actions: ShellFieldActions): SelectItem[] {
  return [
    { value: 'set-timeout', label: 'Set timeout', description: 'Foreground command timeout in ms' },
    ...actions.canClearTimeout
      ? [{ value: 'clear-timeout', label: 'Clear timeout', description: 'Use the composition default' }]
      : [],
    { value: 'set-output', label: 'Set output cap', description: 'Per-stream output cap in bytes' },
    ...actions.canClearOutput
      ? [{ value: 'clear-output', label: 'Clear output cap', description: 'Use the composition default' }]
      : [],
  ]
}

/**
 * Agent-loop parallel-cap actions. Set is always present; Clear appears when
 * the user layer names `maxParallelToolCalls`.
 * @param canClear - true when a user override exists.
 * @returns rows in declaration order.
 */
export function agentLoopActionRows(canClear: boolean): SelectItem[] {
  return [
    { value: 'set-parallel', label: 'Set parallel cap', description: 'In-flight tool calls per step' },
    ...canClear
      ? [{ value: 'clear-parallel', label: 'Clear parallel cap', description: 'Use the composition default' }]
      : [],
  ]
}

/** Optional Clear max-uses row on the Web search picker. */
export interface WebSearchFieldActions extends ProviderCredentialActions {
  /** Show Clear max uses when the user layer names `maxUses`. */
  readonly canClearMaxUses: boolean
}

/**
 * Web search actions: the Models credential/endpoint rows, then Set max uses
 * and optional Clear. Model and protocol stay off this path.
 * @param actions - which optional rows to include.
 * @returns rows in declaration order.
 */
export function webSearchActionRows(actions: WebSearchFieldActions): SelectItem[] {
  return [
    ...providerCredentialRows(actions),
    { value: 'set-uses', label: 'Set max uses', description: 'Server-side searches per request' },
    ...actions.canClearMaxUses
      ? [{ value: 'clear-uses', label: 'Clear max uses', description: 'Use the composition default' }]
      : [],
  ]
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
