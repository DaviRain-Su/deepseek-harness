/**
 * `/sessions` catalog: top-level sessions in this cwd, newest first, labelled
 * from a log-backed title when the query service can fold one.
 * @module @deepseek-ai/dsh-tui/sessions
 */

import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { SelectItem } from '@oh-my-pi/pi-tui'

/** One row the session picker can show. */
export interface SessionPickerEntry {
  /** Persisted session id. */
  readonly id: string
  /** Header used for cwd / parent / createdAt. */
  readonly header: SessionHeader
  /** Latest folded title, when the query service observed one. */
  readonly title?: string
}

/**
 * Whether a persisted session belongs on the TUI picker: top-level (no parent,
 * not a subagent child) and either this cwd or no recorded cwd.
 * @param header - the session's storage metadata.
 * @param cwd - the TUI process working directory.
 * @returns true when the row should appear.
 */
export function isSwitchableSession(header: SessionHeader, cwd: string): boolean {
  if (header.origin === 'subagent') return false
  if (header.parentSession !== undefined) return false
  return header.cwd === undefined || header.cwd === cwd
}

/**
 * Format `createdAt` as a stable UTC `YYYY-MM-DD HH:MM` stamp.
 * @param createdAt - Unix epoch milliseconds.
 * @returns a 16-character UTC stamp.
 */
export function formatSessionCreatedAt(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Build one picker row: title or id, with created-at and an optional current mark.
 * @param entry - the catalog row.
 * @param currentId - the live TUI session id, when any.
 * @returns a SelectList item whose value is the session id.
 */
export function sessionPickerItem(entry: SessionPickerEntry, currentId?: string): SelectItem {
  const current = currentId !== undefined && entry.id === currentId
  const created = formatSessionCreatedAt(entry.header.createdAt)
  return {
    value: entry.id,
    label: entry.title ?? entry.id,
    description: current ? `${created} · current` : created,
  }
}
