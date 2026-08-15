/** Local `/export` path: sanitized default filename and cwd-relative resolve. */

import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import {
  resolveSessionExportPath,
  safeSessionIdSegment,
  sessionExportFilename,
} from '../src/export.ts'

describe('sessionExportFilename', () => {
  it('sanitizes the session id and keeps a jsonl suffix', () => {
    expect(safeSessionIdSegment('session:1/a')).toBe('session_1_a')
    expect(sessionExportFilename('session:1/a')).toBe('dsh-session-session_1_a.jsonl')
    expect(resolveSessionExportPath('', 'abc', '/work')).toBe(resolve('/work', 'dsh-session-abc.jsonl'))
    expect(resolveSessionExportPath('out.jsonl', 'abc', '/work')).toBe(resolve('/work', 'out.jsonl'))
    expect(resolveSessionExportPath('/tmp/out.jsonl', 'abc', '/work')).toBe(resolve('/tmp/out.jsonl'))
  })
})
