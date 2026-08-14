import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { AuthInteraction, Credential } from '@earendil-works/pi-ai'
import LlmOAuthService, {
  Config,
  OAUTH_FILENAME,
  parseOAuthDocument,
  resolveSpec,
} from '../src/index.ts'

const OAUTH: Credential = {
  type: 'oauth',
  access: 'access-token',
  refresh: 'refresh-token',
  expires: 9_999_999_999_999,
}

vi.mock('@earendil-works/pi-ai/providers/all', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@earendil-works/pi-ai/providers/all')>()
  const credential: Credential = {
    type: 'oauth',
    access: 'access-token',
    refresh: 'refresh-token',
    expires: 9_999_999_999_999,
  }
  return {
    ...actual,
    builtinProviders: () => {
      if ((globalThis as { __dshOAuthEmptyCatalog?: boolean }).__dshOAuthEmptyCatalog === true) return []
      return actual.builtinProviders().map((provider) => {
        if (provider.id !== 'openai-codex' || provider.auth.oauth === undefined) return provider
        return {
          ...provider,
          auth: {
            ...provider.auth,
            oauth: {
              ...provider.auth.oauth,
              name: undefined,
              loginLabel: 'ChatGPT Plus/Pro',
              login: async () => credential,
            },
          },
        }
      })
    },
  }
})

const interaction: AuthInteraction = {
  prompt: async () => 'unused',
  notify: () => {},
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  delete (globalThis as { __dshOAuthEmptyCatalog?: boolean }).__dshOAuthEmptyCatalog
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-llm-oauth-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function writeAuth(path: string, text: string): Promise<void> {
  await writeFile(path, text, { mode: 0o600 })
}

async function boot(config: ConstructorParameters<typeof LlmOAuthService>[1]): Promise<Context> {
  const ctx = new Context()
  const fiber = ctx.plugin(LlmOAuthService, config)
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return ctx
}

describe('resolveSpec and Config', () => {
  it('defaults the document under the harness home with watching on', () => {
    const spec = resolveSpec({ dshHome: '/custom/home' })
    expect(spec).toEqual({
      filename: resolve('/custom/home', OAUTH_FILENAME),
      watch: true,
      debounceMs: 100,
    })
  })

  it('lets an explicit path win over the home', () => {
    const spec = resolveSpec({ path: '/etc/dsh/.auth.yaml', dshHome: '/ignored', watch: false, debounceMs: 5 })
    expect(spec).toEqual({ filename: resolve('/etc/dsh/.auth.yaml'), watch: false, debounceMs: 5 })
  })

  it('materializes schema defaults when construction bypasses resolveSpec', () => {
    expect(Config({})).toEqual({ watch: true, debounceMs: 100 })
  })
})

describe('parseOAuthDocument', () => {
  it('reads a mapping of oauth credentials', () => {
    const parsed = parseOAuthDocument(
      'openai-codex:\n  type: oauth\n  access: a\n  refresh: r\n  expires: 1\n',
      '/tmp/.auth.yaml',
    )
    expect(parsed.get('openai-codex')).toEqual({ type: 'oauth', access: 'a', refresh: 'r', expires: 1 })
  })

  it('rejects malformed YAML, a non-mapping root, an empty id, and a non-oauth value', () => {
    expect(() => parseOAuthDocument('{[', '/tmp/.auth.yaml')).toThrow(/invalid document/)
    expect(() => parseOAuthDocument('- not a mapping\n', '/tmp/.auth.yaml'))
      .toThrow(/must be a mapping/)
    expect(() => parseOAuthDocument('"":\n  type: oauth\n  access: a\n  refresh: r\n  expires: 1\n', '/tmp/.auth.yaml'))
      .toThrow(/empty provider id/)
    expect(() => parseOAuthDocument('openai-codex: { type: api_key, key: k }\n', '/tmp/.auth.yaml'))
      .toThrow(/must be an oauth credential/)
    expect(() => parseOAuthDocument('openai-codex: null\n', '/tmp/.auth.yaml'))
      .toThrow(/must be an oauth credential/)
    expect(() => parseOAuthDocument('openai-codex: []\n', '/tmp/.auth.yaml'))
      .toThrow(/must be an oauth credential/)
  })
})

describe('store boot and reads', () => {
  it('surfaces a non-ENOENT stat failure at the document path', async () => {
    const dir = await tempDir()
    const file = join(dir, 'not-a-dir')
    await writeFile(file, 'x')
    await expect(boot({ path: join(file, '.auth.yaml'), watch: false })).rejects.toThrow(/ENOTDIR/)
  })

  it('treats an absent file as an empty store', async () => {
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    expect(await ctx.llmOAuth.list()).toEqual([])
    expect(await ctx.llmOAuth.read('openai-codex')).toBeUndefined()
  })

  it('loads an existing owner-only document', async () => {
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    await writeAuth(path, 'openai-codex:\n  type: oauth\n  access: a\n  refresh: r\n  expires: 1\n')
    const ctx = await boot({ path, watch: false })
    expect(await ctx.llmOAuth.list()).toEqual([{ providerId: 'openai-codex', type: 'oauth' }])
    expect(await ctx.llmOAuth.read('openai-codex')).toEqual({
      type: 'oauth', access: 'a', refresh: 'r', expires: 1,
    })
  })

  it('refuses a document other OS users can read', async () => {
    if (process.platform === 'win32') return
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    await writeFile(path, 'openai-codex:\n  type: oauth\n  access: a\n  refresh: r\n  expires: 1\n', { mode: 0o644 })
    await expect(boot({ path, watch: false })).rejects.toThrow(/readable beyond its owner/)
  })

  it('fails activation when the document path is a directory', async () => {
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    await mkdir(path, { mode: 0o700 })
    await expect(boot({ path, watch: false })).rejects.toThrow(/EISDIR/)
  })

  it('fails activation on an invalid document', async () => {
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    await writeAuth(path, '- not a mapping\n')
    await expect(boot({ path, watch: false })).rejects.toThrow(/must be a mapping/)
  })
})

describe('loginableProviders, login, logout, modify', () => {
  it('lists installed catalog providers that ship an OAuth flow', async () => {
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    const ids = ctx.llmOAuth.loginableProviders().map(provider => provider.id)
    expect(ids).toEqual(expect.arrayContaining(['openai-codex', 'anthropic', 'xai']))
    expect(ctx.llmOAuth.loginableProviders().find(provider => provider.id === 'openai-codex'))
      .toEqual(expect.objectContaining({ id: 'openai-codex', name: 'openai-codex', loginLabel: 'ChatGPT Plus/Pro' }))
    expect(ids.every(id => id.length > 0)).toBe(true)
  })

  it('names no available providers when the catalog ships no OAuth flow', async () => {
    ;(globalThis as { __dshOAuthEmptyCatalog?: boolean }).__dshOAuthEmptyCatalog = true
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    await expect(ctx.llmOAuth.login('openai-codex', interaction)).rejects.toThrow(/available: none/)
  })

  it('rejects login for a provider with no OAuth flow', async () => {
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    await expect(ctx.llmOAuth.login('deepseek', interaction)).rejects.toMatchObject({
      code: 'NO_OAUTH',
    })
    await expect(ctx.llmOAuth.login('deepseek', interaction)).rejects.toBeInstanceOf(LlmError)
  })

  it('runs a provider login and persists the credential owner-only', async () => {
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    const ctx = await boot({ path, watch: false })
    const updated: string[] = []
    ctx.on('llm/oauth-updated', (provider) => { updated.push(provider) })

    await expect(ctx.llmOAuth.login('openai-codex', interaction)).resolves.toEqual(OAUTH)
    expect(await ctx.llmOAuth.read('openai-codex')).toEqual(OAUTH)
    expect(updated).toEqual(['openai-codex'])
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
    expect(await readFile(path, 'utf8')).toMatch(/type: oauth/)
  })

  it('logout deletes a stored credential and is a no-op when absent', async () => {
    const dir = await tempDir()
    const path = join(dir, '.auth.yaml')
    await writeAuth(path, 'openai-codex:\n  type: oauth\n  access: a\n  refresh: r\n  expires: 1\n')
    const ctx = await boot({ path, watch: false })
    const updated: string[] = []
    ctx.on('llm/oauth-updated', (provider) => { updated.push(provider) })
    await ctx.llmOAuth.logout('openai-codex')
    expect(await ctx.llmOAuth.read('openai-codex')).toBeUndefined()
    expect(updated).toEqual(['openai-codex'])
    await ctx.llmOAuth.logout('openai-codex')
    expect(updated).toEqual(['openai-codex'])
  })

  it('modify writes, leaves the entry unchanged when the callback returns undefined, and compares api-key tokens', async () => {
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    const updated: string[] = []
    ctx.on('llm/oauth-updated', (provider) => { updated.push(provider) })

    await expect(ctx.llmOAuth.modify('custom', async () => undefined)).resolves.toBeUndefined()
    expect(updated).toEqual([])

    const key: Credential = { type: 'api_key', key: 'k1' }
    await expect(ctx.llmOAuth.modify('custom', async () => key)).resolves.toEqual(key)
    expect(updated).toEqual(['custom'])
    await ctx.llmOAuth.modify('custom', async () => ({ type: 'api_key', key: 'k2' }))
    expect(updated).toEqual(['custom', 'custom'])
  })

  it('refuses modify and delete after dispose', async () => {
    const dir = await tempDir()
    const ctx = new Context()
    const fiber = ctx.plugin(LlmOAuthService, { path: join(dir, '.auth.yaml'), watch: false })
    await fiber
    const oauth = ctx.llmOAuth
    await fiber.dispose()
    await expect(oauth.modify('openai-codex', async () => OAUTH))
      .rejects.toThrow(/disposed/)
    await expect(oauth.delete('openai-codex')).rejects.toThrow(/disposed/)
  })
})

describe('llm/oauth-updated fan-out', () => {
  it('contains a sync listener failure and rethrows an INVARIANT', async () => {
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    ctx.on('llm/oauth-updated', () => {
      throw new Error('listener exploded')
    })
    await ctx.llmOAuth.modify('openai-codex', async () => OAUTH)
    expect(warn).toHaveBeenCalled()

    ctx.on('llm/oauth-updated', () => {
      throw Object.assign(new Error('invariant'), { code: 'INVARIANT' })
    })
    await expect(ctx.llmOAuth.modify('openai-codex', async () => ({ ...OAUTH, access: 'next' })))
      .rejects.toMatchObject({ code: 'INVARIANT' })
  })

  it('contains an async listener failure', async () => {
    const dir = await tempDir()
    const ctx = await boot({ path: join(dir, '.auth.yaml'), watch: false })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    ctx.on('llm/oauth-updated', () => 1)
    /* eslint-disable @typescript-eslint/no-misused-promises -- exercise async listener rejection containment */
    ctx.on('llm/oauth-updated', () => Promise.resolve())
    ctx.on('llm/oauth-updated', () => Promise.reject(new Error('async listener exploded')))
    /* eslint-enable @typescript-eslint/no-misused-promises */
    await ctx.llmOAuth.modify('openai-codex', async () => OAUTH)
    await vi.waitFor(() => {
      expect(warn.mock.calls.some(call => String(call[0]).includes('listener'))).toBe(true)
    })
  })
})
