/**
 * `/settings` overlay hub and the Permission preset sub-panel. The hub is an
 * `OverlayPicker` whose rows are sub-panels; `app.ts` dispatches a confirmed
 * row to the matching sub-panel picker. The Permission sub-panel reads the
 * mounted `PermissionPresetService` and writes a selection through `set`.
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

/** Hub rows for the panels shipped in 3a.
 * @returns the Appearance and Permission rows.
 */
export function settingsHubRows(): SelectItem[] {
  return [
    { value: 'theme', label: 'Appearance', description: 'Terminal theme' },
    { value: 'permission', label: 'Permission', description: 'Sandbox mode + approval policy preset' },
  ]
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
