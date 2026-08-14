#!/usr/bin/env node
/**
 * Source `pnpm dsh` entry: tui requires bun; headless and login use bun
 * when PATH has one. web / plugin / dumps / launcher help stay on tsx.
 * @module @deepseek-ai/dsh/dsh-launch
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  hasUsableBun,
  missingBunMessage,
  wantsOptionalBunHotPath,
  wantsTuiBunHotPath,
} from './tui-hot-path.mjs'

const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
const args = process.argv.slice(2)

if (wantsTuiBunHotPath(args)) {
  if (!hasUsableBun()) {
    process.stderr.write(missingBunMessage())
    process.exit(1)
  }
  process.exit(runBun(bin, args))
}

if (wantsOptionalBunHotPath(args) && hasUsableBun()) {
  process.exit(runBun(bin, args))
}

const result = spawnSync(process.execPath, ['--import', 'tsx/esm', bin, ...args], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status ?? 1)

/**
 * @param {string} entry - absolute path of `bin.ts`.
 * @param {readonly string[]} argv - forwarded launcher arguments.
 * @returns {number} the child exit status.
 */
function runBun(entry, argv) {
  const result = spawnSync('bun', [entry, ...argv], {
    stdio: 'inherit',
    env: process.env,
  })
  return result.status ?? 1
}
