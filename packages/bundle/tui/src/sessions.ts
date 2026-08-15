/**
 * `/sessions` catalog: conversations across recorded cwds, this process cwd
 * first, including ordinary forks and subagent-origin children. Labelled from
 * a log-backed title when the query service can fold one.
 * @module @deepseek-ai/dsh-tui/sessions
 */

import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { SelectItem } from '@oh-my-pi/pi-tui'
import { formatCwdForFooter, homeDir } from './chrome.ts'

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
 * Format `createdAt` as a stable UTC `YYYY-MM-DD HH:MM` stamp.
 * @param createdAt - Unix epoch milliseconds.
 * @returns a 16-character UTC stamp.
 */
export function formatSessionCreatedAt(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Sort key for one picker row: this process cwd (and a missing cwd) first,
 * then other cwds alphabetically, then newest `createdAt`.
 * @param entry - the catalog row.
 * @param processCwd - the TUI process working directory.
 * @returns 0 for this cwd / missing cwd, 1 for every other recorded cwd.
 */
export function sessionCwdGroup(entry: SessionPickerEntry, processCwd: string): 0 | 1 {
  const cwd = entry.header.cwd
  if (cwd === undefined || cwd === processCwd) return 0
  return 1
}

/**
 * Order picker rows so this cwd's sessions sit together at the top.
 * @param left - first row.
 * @param right - second row.
 * @param processCwd - the TUI process working directory.
 * @returns a `Array.sort` comparator result.
 */
export function compareSessionPickerEntries(
  left: SessionPickerEntry,
  right: SessionPickerEntry,
  processCwd: string,
): number {
  const leftGroup = sessionCwdGroup(left, processCwd)
  const rightGroup = sessionCwdGroup(right, processCwd)
  if (leftGroup !== rightGroup) return leftGroup - rightGroup
  if (leftGroup === 1) {
    const byCwd = (left.header.cwd ?? '').localeCompare(right.header.cwd ?? '')
    if (byCwd !== 0) return byCwd
  }
  const byCreated = right.header.createdAt - left.header.createdAt
  if (byCreated !== 0) return byCreated
  return left.id.localeCompare(right.id)
}

/**
 * Copy and sort picker rows for the overlay.
 * @param entries - unsorted catalog rows.
 * @param processCwd - the TUI process working directory.
 * @returns a new array in picker order.
 */
export function sortSessionPickerEntries(
  entries: readonly SessionPickerEntry[],
  processCwd: string,
): SessionPickerEntry[] {
  return [...entries].sort((left, right) => compareSessionPickerEntries(left, right, processCwd))
}

/**
 * Build one picker row: title or id, with created-at, formatted cwd, an
 * optional `subagent` mark, and an optional current mark.
 * @param entry - the catalog row.
 * @param currentId - the live TUI session id, when any.
 * @param home - `HOME` / `USERPROFILE`; omitted when the process has neither.
 * @returns a SelectList item whose value is the session id.
 */
export function sessionPickerItem(
  entry: SessionPickerEntry,
  currentId?: string,
  home: string | undefined = homeDir(),
): SelectItem {
  const current = currentId !== undefined && entry.id === currentId
  const created = formatSessionCreatedAt(entry.header.createdAt)
  const cwd = entry.header.cwd === undefined
    ? undefined
    : formatCwdForFooter(entry.header.cwd, home)
  const description = [
    created,
    ...cwd === undefined ? [] : [cwd],
    ...entry.header.origin === 'subagent' ? ['subagent'] : [],
    ...current ? ['current'] : [],
  ].join(' · ')
  return {
    value: entry.id,
    label: entry.title ?? entry.id,
    description,
  }
}
