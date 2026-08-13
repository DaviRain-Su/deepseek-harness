/** bun version gate used before the tui profile re-execs. */

import { describe, expect, it } from 'vitest'
import {
  bunVersionSatisfies,
  isBunRuntime,
  missingBunMessage,
  TUI_BUN_MIN_VERSION,
} from '../src/bun-reexec.ts'

describe('tui bun re-exec gate', () => {
  it('accepts bun at or above the OMP engine floor', () => {
    expect(TUI_BUN_MIN_VERSION).toBe('1.3.14')
    expect(bunVersionSatisfies('1.3.14')).toBe(true)
    expect(bunVersionSatisfies('1.3.14+profile')).toBe(true)
    expect(bunVersionSatisfies('1.4.0')).toBe(true)
    expect(bunVersionSatisfies('2.0.0')).toBe(true)
    expect(bunVersionSatisfies('1.3.13')).toBe(false)
    expect(bunVersionSatisfies('1.2.99')).toBe(false)
    expect(bunVersionSatisfies('0.9.0')).toBe(false)
    expect(bunVersionSatisfies('not-a-version')).toBe(false)
    expect(bunVersionSatisfies('')).toBe(false)
  })

  it('detects bun from process.versions and names the install URL on a miss', () => {
    expect(isBunRuntime({ node: '24.0.0' })).toBe(false)
    expect(isBunRuntime({ bun: '1.3.14' })).toBe(true)
    expect(missingBunMessage()).toContain('https://bun.sh')
    expect(missingBunMessage()).toContain(TUI_BUN_MIN_VERSION)
  })
})
