/**
 * `/preset` picker rows and the blank-session lock the TUI shares with the
 * Web select path. Mounting stays in `app.ts` so create/resume/switch use
 * one `AgentPresets.mount` call site.
 * @module @deepseek-ai/dsh-tui/presets
 */

import type { SelectItem } from '@oh-my-pi/pi-tui'

/** One roster entry the `/preset` picker can show. */
export interface PresetPickerEntry {
  /** Stable preset id (the directory name). */
  readonly id: string
  /** Display name; absent falls back to {@link id}. */
  readonly name?: string
  /** One-sentence purpose, when the preset published one. */
  readonly description?: string
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/**
 * Whether the session has produced a model turn. Standalone plugin events
 * never open a turn, so `/plan` or `/goal` on a fresh session keeps it blank.
 * @param session - the live session's event log.
 * @returns true when no `turn/start` has been appended.
 */
export function sessionBlank(session: { readonly events: readonly { readonly type: string }[] }): boolean {
  return !session.events.some(event => event.type === 'turn/start')
}

/**
 * One `/preset` picker row. A broken preset stays visible so the id is not
 * a silent hole; the owner refuses to recompose it.
 * @param preset - a roster entry.
 * @param current - the live agent's composed preset id, when any.
 * @returns a SelectList item whose value is the preset id.
 */
export function presetPickerItem(preset: PresetPickerEntry, current?: string): SelectItem {
  const label = preset.name ?? preset.id
  const parts: string[] = []
  if (preset.id !== label) parts.push(preset.id)
  if (preset.description !== undefined && preset.description.length > 0) parts.push(preset.description)
  if (preset.broken !== undefined) parts.push(`broken: ${preset.broken}`)
  if (current === preset.id) parts.push('current')
  return {
    value: preset.id,
    label: preset.broken === undefined ? label : `${label} (broken)`,
    ...parts.length === 0 ? {} : { description: parts.join(' · ') },
  }
}
