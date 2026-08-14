import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmOAuthService from '../src/index.ts'

class FakeWatcher extends EventEmitter {
  close = vi.fn(() => Promise.resolve())
}

const instances: Array<{
  path: string
  options: { awaitWriteFinish: { stabilityThreshold: number; pollInterval: number } }
  watcher: FakeWatcher
}> = []

vi.mock('chokidar', () => ({
  watch: vi.fn((path: string, options: {
    awaitWriteFinish: { stabilityThreshold: number; pollInterval: number }
  }) => {
    const watcher = new FakeWatcher()
    instances.push({ path, options, watcher })
    return watcher
  }),
}))

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
  instances.length = 0
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-llm-oauth-watch-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function boot(config: ConstructorParameters<typeof LlmOAuthService>[1]): Promise<Context> {
  const ctx = new Context()
  const fiber = ctx.plugin(LlmOAuthService, config)
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return ctx
}

describe('watcher pipeline', () => {
  it('does not open a watcher when watch is false', async () => {
    const dir = await tempDir()
    await boot({ path: join(dir, '.auth.yaml'), watch: false })
    expect(instances).toHaveLength(0)
  })

  it('clamps the write-settle poll interval for a zero debounce', async () => {
    const dir = await tempDir()
    await boot({ path: join(dir, '.auth.yaml'), debounceMs: 0 })
    expect(instances[0]!.options.awaitWriteFinish).toEqual({
      stabilityThreshold: 0,
      pollInterval: 1,
    })
  })

  it('reloads on all and ready, ignores events after dispose, and warns on watcher error', async () => {
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    await writeFile(path, '', { mode: 0o600 })
    const ctx = await boot({ path, debounceMs: 5 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const updated: string[] = []
    ctx.on('llm/oauth-updated', (provider) => { updated.push(provider) })
    const { watcher } = instances[0]!

    await writeFile(path, 'openai-codex:\n  type: oauth\n  access: a\n  refresh: r\n  expires: 1\n', { mode: 0o600 })
    watcher.emit('all', 'change', path)
    await vi.waitFor(() => {
      expect(updated).toContain('openai-codex')
    })

    watcher.emit('ready')
    watcher.emit('error', new Error('watch failed'))
    expect(warn).toHaveBeenCalled()

    await writeFile(path, '- broken\n', { mode: 0o600 })
    watcher.emit('all', 'change', path)
    await vi.waitFor(() => {
      expect(warn.mock.calls.some(call => String(call[0]).includes('reload failed'))).toBe(true)
    })
    expect(await ctx.llmOAuth.read('openai-codex')).toEqual({
      type: 'oauth', access: 'a', refresh: 'r', expires: 1,
    })

    if (process.platform !== 'win32') {
      warn.mockClear()
      await chmod(path, 0o000)
      watcher.emit('all', 'change', path)
      await vi.waitFor(() => {
        expect(warn.mock.calls.some(call => String(call[0]).includes('reload failed'))).toBe(true)
      })
      await chmod(path, 0o600)
    }

    await writeFile(path, 'openai-codex: { type: oauth, access: a, refresh: r, expires: 1 }\n', { mode: 0o600 })
    watcher.emit('all', 'change', path)
    await expect(ctx.llmOAuth.read('openai-codex')).resolves.toEqual({
      type: 'oauth', access: 'a', refresh: 'r', expires: 1,
    })

    await unlink(path)
    watcher.emit('all', 'change', path)
    await vi.waitFor(async () => {
      expect(await ctx.llmOAuth.read('openai-codex')).toBeUndefined()
    })

    await ctx.fiber.dispose()
    watcher.emit('all', 'change', path)
    watcher.emit('ready')
  })
})
