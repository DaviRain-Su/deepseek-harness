/**
 * Shared assertions for launching the tui profile without a TTY.
 * bun may be absent on a Node-only CI host; the launcher then fails before
 * the TTY check.
 */

import { spawnSync } from 'node:child_process'
import { expect } from 'vitest'
import { bunVersionSatisfies, missingBunMessage } from '../src/bun-reexec.ts'

/** Whether PATH has a bun that meets the TUI engine floor. */
export function hasUsableBun(): boolean {
  const probe = spawnSync('bun', ['--version'], { encoding: 'utf8' })
  return probe.status === 0 && bunVersionSatisfies(probe.stdout)
}

/**
 * Assert a non-TTY tui launch failed with the TTY diagnostic when bun can
 * re-exec, or with the missing-bun diagnostic otherwise.
 * @param stderr - combined launcher stderr.
 */
export function expectTuiLaunchFailure(stderr: string): void {
  if (hasUsableBun()) {
    expect(stderr).toContain('tui requires an interactive TTY')
    return
  }
  expect(stderr).toContain(missingBunMessage().trim())
}
