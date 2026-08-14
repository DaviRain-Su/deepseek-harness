/** Classification for the source bun hop: tui required, headless/login optional. */

import { describe, expect, it } from 'vitest'
import { DEFAULT_BOOT_PROFILE, parseDshArgs } from '../src/args.ts'
import { TUI_BUN_MIN_VERSION, bunVersionSatisfies } from '../src/bun-reexec.ts'
import {
  TUI_BUN_MIN_VERSION as launchFloor,
  bunVersionSatisfies as launchSatisfies,
  classifySourceLaunch,
  wantsOptionalBunHotPath,
  wantsTuiBunHotPath,
} from '../src/tui-hot-path.mjs'

const parse = (argv: string[]) => parseDshArgs(argv, '1.2.3')

describe('source-launch bun classification', () => {
  it('keeps the launch-script bun floor identical to the Node re-exec gate', () => {
    expect(launchFloor).toBe(TUI_BUN_MIN_VERSION)
    expect(launchSatisfies('1.3.14')).toBe(bunVersionSatisfies('1.3.14'))
    expect(launchSatisfies('1.3.13')).toBe(bunVersionSatisfies('1.3.13'))
  })

  it('requires bun for tui and offers it for headless and login', () => {
    expect(classifySourceLaunch([])).toBe('tui')
    expect(wantsTuiBunHotPath(['--resume', 'abc'])).toBe(true)
    expect(wantsTuiBunHotPath(['--profile', 'tui', '--help'])).toBe(true)
    expect(wantsOptionalBunHotPath(['--profile', 'headless', 'task'])).toBe(true)
    expect(wantsOptionalBunHotPath(['--profile', 'headless', '--help'])).toBe(true)
    expect(wantsOptionalBunHotPath(['login', 'openai-codex'])).toBe(true)
    expect(wantsOptionalBunHotPath(['logout', 'openai-codex'])).toBe(true)
    expect(wantsOptionalBunHotPath(['auth'])).toBe(true)
    expect(wantsTuiBunHotPath(['--profile', 'headless', 'task'])).toBe(false)
    expect(wantsOptionalBunHotPath([])).toBe(false)
    expect(wantsTuiBunHotPath(['--help'])).toBe(false)
    expect(wantsOptionalBunHotPath(['--help'])).toBe(false)
    expect(wantsOptionalBunHotPath(['--dump-config'])).toBe(false)
    expect(wantsOptionalBunHotPath(['--profile', 'headless', '--dump-config'])).toBe(false)
    expect(wantsOptionalBunHotPath(['web'])).toBe(false)
    expect(wantsOptionalBunHotPath(['--profile', 'web'])).toBe(false)
    expect(wantsOptionalBunHotPath(['plugin', '--profile', 'tui', 'add', 'x'])).toBe(false)
  })

  it('agrees with parseDshArgs on boots that do not print and exit', () => {
    const samples = [
      [],
      ['--resume', 'abc'],
      ['--profile', 'tui'],
      ['--profile', 'tui', '--resume', 'abc'],
      ['--patch', 'a.yml'],
      ['--dump-config'],
      ['--dump-default-config'],
      ['--profile', 'tui', '--dump-config'],
      ['--profile', 'web'],
      ['web'],
      ['--profile', 'headless', 'run'],
      ['--profile', 'headless', '--dump-config'],
      ['plugin', '--profile', 'tui', 'add', 'x'],
      ['login', 'openai-codex'],
      ['logout', 'openai-codex'],
      ['auth'],
    ]
    for (const argv of samples) {
      const invocation = parse(argv)
      const kind = classifySourceLaunch(argv)
      if (invocation.mode === 'profile' && invocation.profile === DEFAULT_BOOT_PROFILE) {
        expect(kind, JSON.stringify(argv)).toBe('tui')
        expect(wantsTuiBunHotPath(argv)).toBe(true)
        continue
      }
      if (invocation.mode === 'profile' && invocation.profile === 'headless') {
        expect(kind, JSON.stringify(argv)).toBe('headless')
        expect(wantsOptionalBunHotPath(argv)).toBe(true)
        continue
      }
      if (invocation.mode === 'login') {
        expect(kind, JSON.stringify(argv)).toBe('login')
        expect(wantsOptionalBunHotPath(argv)).toBe(true)
        continue
      }
      expect(kind, JSON.stringify(argv)).toBe('node')
      expect(wantsTuiBunHotPath(argv)).toBe(false)
      expect(wantsOptionalBunHotPath(argv)).toBe(false)
    }
  })
})
