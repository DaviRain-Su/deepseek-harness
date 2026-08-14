/** Session picker rows: cwd filter, title label, and current mark. */

import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import {
  formatSessionCreatedAt,
  isSwitchableSession,
  sessionPickerItem,
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

describe('isSwitchableSession', () => {
  it('keeps top-level sessions in this cwd and drops children', () => {
    expect(isSwitchableSession(header(), '/work')).toBe(true)
    const noCwd: SessionHeader = { version: 0, id: SessionId('session-1'), createdAt: Date.UTC(2026, 7, 14, 3, 4, 0) }
    expect(isSwitchableSession(noCwd, '/work')).toBe(true)
    expect(isSwitchableSession(header({ cwd: '/other' }), '/work')).toBe(false)
    expect(isSwitchableSession(header({ origin: 'subagent' }), '/work')).toBe(false)
    expect(isSwitchableSession(header({ parentSession: SessionId('parent') }), '/work')).toBe(false)
  })
})

describe('sessionPickerItem', () => {
  it('prefers a title and marks the current session', () => {
    expect(formatSessionCreatedAt(Date.UTC(2026, 7, 14, 3, 4, 0))).toBe('2026-08-14 03:04')
    const titled = sessionPickerItem(
      { id: 'session-1', header: header(), title: 'Fix the picker' },
      'session-1',
    )
    expect(titled).toEqual({
      value: 'session-1',
      label: 'Fix the picker',
      description: '2026-08-14 03:04 · current',
    })
    const untitled = sessionPickerItem({ id: 'session-2', header: header({ id: SessionId('session-2') }) })
    expect(untitled.label).toBe('session-2')
    expect(untitled.description).toBe('2026-08-14 03:04')
  })
})
