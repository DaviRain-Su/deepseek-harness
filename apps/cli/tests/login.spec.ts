import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'

const boot = vi.fn()
const provideCmdline = vi.fn()

vi.mock('@deepseek-ai/dsh-app-boot', () => ({ boot }))
vi.mock('@deepseek-ai/dsh-cmdline', () => ({ provideCmdline }))

afterEach(() => {
  boot.mockReset()
  provideCmdline.mockReset()
})

describe('runLoginCommand', () => {
  it('boots the minimal login tree and hands the inner arguments to the command surface', async () => {
    const { runLoginCommand } = await import('../src/login.ts')
    const ctx = new Context()
    boot.mockImplementation(async (_bin: string, rootConfig: string, _patches: unknown, prepare: (host: Context) => void) => {
      const text = await readFile(rootConfig, 'utf8')
      expect(text).toContain('@deepseek-ai/dsh-llm-oauth')
      expect(text).toContain('@deepseek-ai/dsh-command-login')
      prepare(ctx)
      return ctx
    })

    await expect(runLoginCommand(['auth'])).resolves.toBe(0)
    expect(provideCmdline).toHaveBeenCalledWith(ctx, expect.objectContaining({
      args: ['auth'],
    }))
  })

  it('returns the exit code the command surface requested', async () => {
    const { runLoginCommand } = await import('../src/login.ts')
    const ctx = new Context()
    boot.mockImplementation(async (_bin: string, _root: string, _patches: unknown, prepare: (host: Context) => void) => {
      prepare(ctx)
      const host = provideCmdline.mock.calls.at(-1)?.[1] as { exit: (code: number) => void }
      host.exit(3)
      return ctx
    })
    await expect(runLoginCommand(['login', 'openai-codex'])).resolves.toBe(3)
  })
})
