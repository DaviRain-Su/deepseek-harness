import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { expectTuiLaunchFailure } from './tui-launch.ts'

/**
 * Keyless smoke for SOURCE `dsh` execution: run the exact production vector
 * (`node apps/cli/src/dsh-launch.mjs`) and assert the default tui profile's
 * non-TTY diagnostic. The Node compatibility matrix runs this WHOLE file, so
 * a launcher or bun-floor regression breaks this gate instead of every
 * developer's `pnpm dsh`; the built-bin suite covers the published `lib/`
 * entry, not this source chain.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const dshLaunch = 'apps/cli/src/dsh-launch.mjs'
const dshSourceBin = 'apps/cli/src/bin.ts'

describe('dsh SOURCE launcher (dsh-launch.mjs)', () => {
  it('launches the source CLI without building', async () => {
    const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      readonly scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.dsh).toBe('node apps/cli/src/dsh-launch.mjs')
  })

  it('boots the source entry into the default tui profile', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-source-tui-'))
    try {
      const result = await execa(process.execPath, [dshLaunch], {
        cwd: repoRoot,
        input: '',
        timeout: 55_000,
        killSignal: 'SIGKILL',
        reject: false,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_TELEMETRY_DISABLED: '1',
        },
      })
      if (result.timedOut) {
        throw new Error(`dsh source launch did not exit within 55s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
      }
      expect(result.exitCode).not.toBe(0)
      expectTuiLaunchFailure(result.stderr)
      expect(result.stdout).toBe('')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)

  it('keeps launcher help on Node+tsx', async () => {
    const result = await execa(process.execPath, [dshLaunch, '--help'], {
      cwd: repoRoot,
      timeout: 30_000,
      reject: false,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('boot a DeepSeek Harness profile')
  }, 35_000)

  it('reports a missing headless task through the source launcher', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-source-headless-'))
    try {
      const result = await execa(process.execPath, [dshLaunch, '--profile', 'headless'], {
        cwd: repoRoot,
        timeout: 55_000,
        killSignal: 'SIGKILL',
        reject: false,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_TELEMETRY_DISABLED: '1',
        },
      })
      if (result.timedOut) {
        throw new Error(`dsh headless source launch did not exit within 55s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
      }
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('a task is required')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)

  it('prints headless help through the source launcher', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-source-headless-help-'))
    try {
      const result = await execa(process.execPath, [dshLaunch, '--profile', 'headless', '--help'], {
        cwd: repoRoot,
        timeout: 30_000,
        reject: false,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_TELEMETRY_DISABLED: '1',
        },
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Usage: dsh --profile headless')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 35_000)

  it('lists empty subscription logins through the source launcher', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-source-auth-'))
    try {
      const result = await execa(process.execPath, [dshLaunch, 'auth'], {
        cwd: repoRoot,
        timeout: 55_000,
        killSignal: 'SIGKILL',
        reject: false,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_TELEMETRY_DISABLED: '1',
        },
      })
      if (result.timedOut) {
        throw new Error(`dsh auth source launch did not exit within 55s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
      }
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Subscription logins')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)

  it('still boots tui when bin.ts is reached through Node+tsx', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-source-tui-tsx-'))
    try {
      const result = await execa(process.execPath, ['--import', 'tsx/esm', dshSourceBin], {
        cwd: repoRoot,
        input: '',
        timeout: 55_000,
        killSignal: 'SIGKILL',
        reject: false,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_TELEMETRY_DISABLED: '1',
        },
      })
      if (result.timedOut) {
        throw new Error(`dsh tsx fallback did not exit within 55s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
      }
      expect(result.exitCode).not.toBe(0)
      expectTuiLaunchFailure(result.stderr)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 60_000)
})
