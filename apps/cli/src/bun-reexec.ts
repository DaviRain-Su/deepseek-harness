/**
 * Re-exec the dsh entry under bun when the tui profile needs `@oh-my-pi/pi-tui`.
 * web / headless / dump-config / plugin stay on Node.
 * @module @deepseek-ai/dsh/bun-reexec
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Minimum bun the OMP TUI engine declares (`engines.bun`). */
export const TUI_BUN_MIN_VERSION = '1.3.14'

const MIN_PARTS = [1, 3, 14] as const

/**
 * @param raw - `bun --version` stdout, possibly with a build suffix.
 * @returns whether `raw` is at least {@link TUI_BUN_MIN_VERSION}.
 */
export function bunVersionSatisfies(raw: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim())
  if (match === null) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (major !== MIN_PARTS[0]) return major > MIN_PARTS[0]
  if (minor !== MIN_PARTS[1]) return minor > MIN_PARTS[1]
  return patch >= MIN_PARTS[2]
}

/**
 * @param versions - `process.versions`, or a test double with optional `bun`.
 * @returns whether this process is already bun.
 */
export function isBunRuntime(versions: { bun?: string } = process.versions): boolean {
  return typeof versions.bun === 'string'
}

/**
 * @returns the stderr line written when bun is missing or too old.
 */
export function missingBunMessage(): string {
  return `dsh: the tui profile requires bun >= ${TUI_BUN_MIN_VERSION} (https://bun.sh)\n`
}

/**
 * Replace this Node process with bun running the same entry and argv when the
 * tui profile is about to boot. No-op under bun. Missing or too-old bun exits 1.
 * @param entryUrl - `import.meta.url` of the dsh bin (source `.ts` or built `.js`).
 * @param argv - process argv including the node/bun executable and script path.
 */
export function reexecTuiUnderBun(entryUrl: string, argv: readonly string[] = process.argv): void {
  if (isBunRuntime()) return
  const probe = spawnSync('bun', ['--version'], { encoding: 'utf8' })
  const version = probe.status === 0 ? probe.stdout : ''
  if (probe.status !== 0 || !bunVersionSatisfies(version)) {
    process.stderr.write(missingBunMessage())
    process.exit(1)
  }
  const result = spawnSync('bun', [fileURLToPath(entryUrl), ...argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
}
