/**
 * TUI `/export`: a local JSONL path for this session's durable raw artifact.
 * @module @deepseek-ai/dsh-tui/export
 */

import { resolve } from 'node:path'

/**
 * Collapse a session id to one filesystem-safe path segment.
 * @param id - the raw session id.
 * @returns the sanitized segment.
 */
export function safeSessionIdSegment(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_')
}

/**
 * Default export filename for one session in the process cwd.
 * @param sessionId - the live session id.
 * @returns `dsh-session-<id>.jsonl` with a sanitized id.
 */
export function sessionExportFilename(sessionId: string): string {
  return `dsh-session-${safeSessionIdSegment(sessionId)}.jsonl`
}

/**
 * Resolve the write path for `/export [path]`. An empty argument uses
 * {@link sessionExportFilename} under `cwd`.
 * @param requested - the trimmed command argument, or empty.
 * @param sessionId - the live session id.
 * @param cwd - the TUI process working directory.
 * @returns an absolute destination path.
 */
export function resolveSessionExportPath(
  requested: string,
  sessionId: string,
  cwd: string,
): string {
  const target = requested.length === 0 ? sessionExportFilename(sessionId) : requested
  return resolve(cwd, target)
}
