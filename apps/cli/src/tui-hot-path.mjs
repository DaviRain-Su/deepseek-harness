/**
 * Source-launch bun hop helpers. This file is plain ESM so `pnpm dsh` can
 * classify argv without tsx.
 * @module @deepseek-ai/dsh/tui-hot-path
 */

import { spawnSync } from 'node:child_process'

/** Minimum bun the OMP TUI engine declares (`engines.bun`). Keep in lockstep with `bun-reexec.ts`. */
export const TUI_BUN_MIN_VERSION = '1.3.14'

const MIN_PARTS = [1, 3, 14]
const LOGIN_COMMANDS = new Set(['login', 'logout', 'auth'])
const NODE_COMMANDS = new Set(['web', 'plugin'])
const LAUNCHER_HELP = new Set(['--help', '-h', '--version', '-V'])

/**
 * @param {string} raw - `bun --version` stdout, possibly with a build suffix.
 * @returns {boolean} whether `raw` is at least {@link TUI_BUN_MIN_VERSION}.
 */
export function bunVersionSatisfies(raw) {
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
 * @param {{ bun?: string, node?: string }} [versions] - `process.versions`, or a test double.
 * @returns {boolean} whether this process is already bun.
 */
export function isBunRuntime(versions = process.versions) {
  return typeof versions.bun === 'string'
}

/**
 * @returns {string} the stderr line written when bun is missing or too old.
 */
export function missingBunMessage() {
  return `dsh: the tui profile requires bun >= ${TUI_BUN_MIN_VERSION} (https://bun.sh)\n`
}

/**
 * @returns {boolean} whether PATH has a bun that meets the TUI engine floor.
 */
export function hasUsableBun() {
  const probe = spawnSync('bun', ['--version'], { encoding: 'utf8' })
  return probe.status === 0 && bunVersionSatisfies(probe.stdout)
}

/**
 * @param {readonly string[]} argv - arguments after the launcher script.
 * @returns {'tui' | 'headless' | 'login' | 'node'}
 */
export function classifySourceLaunch(argv) {
  if (argv.length === 0) return 'tui'
  const first = argv[0]
  if (first === undefined) return 'tui'
  if (LOGIN_COMMANDS.has(first)) return 'login'
  if (NODE_COMMANDS.has(first)) return 'node'
  if (LAUNCHER_HELP.has(first)) return 'node'

  let profile = 'tui'
  let dump = false
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === undefined || token === '--') break
    if (token === '--dump-config' || token === '--dump-default-config') {
      dump = true
      continue
    }
    if (token === '--profile') {
      profile = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token.startsWith('--profile=')) {
      profile = token.slice('--profile='.length)
      continue
    }
    if (token === '--patch') {
      i += 1
      continue
    }
    if (token.startsWith('--patch=')) continue
    break
  }
  if (dump) return 'node'
  if (profile === 'tui') return 'tui'
  if (profile === 'headless') return 'headless'
  return 'node'
}

/**
 * Whether source `pnpm dsh` must exec bun before loading `bin.ts`.
 * True only for a tui profile boot. Missing bun is a usage error.
 * @param {readonly string[]} argv - arguments after the launcher script.
 * @returns {boolean}
 */
export function wantsTuiBunHotPath(argv) {
  return classifySourceLaunch(argv) === 'tui'
}

/**
 * Whether source `pnpm dsh` may exec bun when a usable bun is on PATH.
 * Headless and login do not need `bun:ffi`; Node+tsx remains the fallback.
 * @param {readonly string[]} argv - arguments after the launcher script.
 * @returns {boolean}
 */
export function wantsOptionalBunHotPath(argv) {
  const kind = classifySourceLaunch(argv)
  return kind === 'headless' || kind === 'login'
}
