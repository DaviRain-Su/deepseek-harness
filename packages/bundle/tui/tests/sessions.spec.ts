/** Session picker rows: cwd grouping, title label, subagent mark, and current mark. */

import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import {
  formatSessionCreatedAt,
  sessionCwdGroup,
  sessionPickerItem,
  sortSessionPickerEntries,
} from '../src/sessions.ts'

function header(overrides: Partial<SessionHeader> = {}): SessionHeader {
  return {
    version: 0,
    id: SessionId('session-1'),
    createdAt: Date.UTC(2026, 7, 14, 3, 4, 0),
    cwd: '/work',
    ...overrides,
  }
}

function entry(id: string, overrides: Partial<SessionHeader> = {}): {
  id: string
  header: SessionHeader
} {
  return { id, header: header({ id: SessionId(id), ...overrides }) }
}

describe('sortSessionPickerEntries', () => {
  it('puts this cwd and a missing cwd first, then other cwds, newest within a group', () => {
    const olderHere = entry('here-old', { cwd: '/work', createdAt: 1 })
    const newerHere = entry('here-new', { cwd: '/work', createdAt: 3 })
    const missing = {
      id: 'missing',
      header: { version: 0, id: SessionId('missing'), createdAt: 2 },
    }
    const otherB = entry('other-b', { cwd: '/b', createdAt: 9 })
    const otherA = entry('other-a', { cwd: '/a', createdAt: 8 })
    const sorted = sortSessionPickerEntries(
      [otherB, olderHere, otherA, missing, newerHere],
      '/work',
    )
    expect(sorted.map(row => row.id)).toEqual(['here-new', 'missing', 'here-old', 'other-a', 'other-b'])
    expect(sessionCwdGroup(newerHere, '/work')).toBe(0)
    expect(sessionCwdGroup(otherA, '/work')).toBe(1)
  })
})

describe('sessionPickerItem', () => {
  it('prefers a title and marks the current session with its cwd', () => {
    expect(formatSessionCreatedAt(Date.UTC(2026, 7, 14, 3, 4, 0))).toBe('2026-08-14 03:04')
    const titled = sessionPickerItem(
      { id: 'session-1', header: header(), title: 'Fix the picker' },
      'session-1',
      undefined,
    )
    expect(titled).toEqual({
      value: 'session-1',
      label: 'Fix the picker',
      description: '2026-08-14 03:04 · /work · current',
    })
    const untitled = sessionPickerItem(
      { id: 'session-2', header: header({ id: SessionId('session-2'), cwd: '/other' }) },
      undefined,
      undefined,
    )
    expect(untitled.label).toBe('session-2')
    expect(untitled.description).toBe('2026-08-14 03:04 · /other')
    const noCwd = sessionPickerItem({
      id: 'session-3',
      header: { version: 0, id: SessionId('session-3'), createdAt: Date.UTC(2026, 7, 14, 3, 4, 0) },
    }, undefined, undefined)
    expect(noCwd.description).toBe('2026-08-14 03:04')
    const child = sessionPickerItem({
      id: 'session-child',
      header: header({
        id: SessionId('session-child'),
        origin: 'subagent',
        parentSession: SessionId('parent'),
      }),
    }, undefined, undefined)
    expect(child.description).toBe('2026-08-14 03:04 · /work · subagent')
  })
})
