import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmOAuthService } from '@deepseek-ai/dsh-llm-oauth'
import type { AuthInteraction, AuthPrompt, Credential } from '@earendil-works/pi-ai'
import * as commandLogin from '../src/index.ts'
import { ownsInvocation, showStatus } from '../src/index.ts'

const OAUTH: Credential = {
  type: 'oauth',
  access: 'a',
  refresh: 'r',
  expires: 1,
}

vi.mock('../src/interaction.ts', () => ({
  terminalInteraction: () => ({
    prompt: vi.fn(async (prompt: AuthPrompt): Promise<string> => {
      if (prompt.type === 'select') return prompt.options[0]?.id ?? 'openai-codex'
      return 'value'
    }),
    notify: vi.fn(),
  } satisfies AuthInteraction),
}))

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
  internals.stdout = process.stdout
  internals.stderr = process.stderr
})

function stubOAuth(overrides: Partial<LlmOAuthService> = {}): LlmOAuthService {
  return {
    loginableProviders: () => [{ id: 'openai-codex', name: 'OpenAI Codex' }],
    login: vi.fn(async () => OAUTH),
    logout: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    ...overrides,
  } as LlmOAuthService
}

async function run(args: string[], oauth: LlmOAuthService = stubOAuth()): Promise<{
  exits: number[]
  out: string
  err: string
  oauth: LlmOAuthService
}> {
  const observed = { exits: [] as number[], out: '', err: '' }
  internals.stdout = { write: (chunk: string) => { observed.out += chunk; return true } }
  internals.stderr = { write: (chunk: string) => { observed.err += chunk; return true } }
  const ctx = new Context()
  provideCmdline(ctx, { args, exit: (code) => { observed.exits.push(code) } })
  ctx.provide('llmOAuth', oauth)
  const fiber = ctx.plugin(commandLogin)
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return { ...observed, oauth }
}

describe('ownsInvocation', () => {
  it('owns only login, logout, and auth as the first token', () => {
    expect(ownsInvocation(['login'])).toBe(true)
    expect(ownsInvocation(['logout', 'openai-codex'])).toBe(true)
    expect(ownsInvocation(['auth'])).toBe(true)
    expect(ownsInvocation(['--resume', 'abc'])).toBe(false)
    expect(ownsInvocation([])).toBe(false)
  })
})

describe('apply', () => {
  it('does nothing when the invocation is not a login command', async () => {
    const { exits, out } = await run(['--resume', 'abc'])
    expect(exits).toEqual([])
    expect(out).toBe('')
  })

  it('logs in with an explicit provider', async () => {
    const { exits, out, oauth } = await run(['login', 'openai-codex'])
    // eslint-disable-next-line @typescript-eslint/unbound-method -- test assertion against a vi.fn() mock
    expect(oauth.login).toHaveBeenCalledWith('openai-codex', expect.any(Object))
    expect(out).toMatch(/Logged in to "openai-codex"/)
    expect(exits).toEqual([0])
  })

  it('prompts for a provider when login omits one', async () => {
    const { exits, oauth } = await run(['login'])
    // eslint-disable-next-line @typescript-eslint/unbound-method -- test assertion against a vi.fn() mock
    expect(oauth.login).toHaveBeenCalledWith('openai-codex', expect.any(Object))
    expect(exits).toEqual([0])
  })

  it('fails login when no provider ships an OAuth flow', async () => {
    const { exits, err } = await run(['login'], stubOAuth({
      loginableProviders: () => [],
    }))
    expect(err).toMatch(/no pi-ai providers/)
    expect(exits).toEqual([1])
  })

  it('writes a login failure and exits 1', async () => {
    const { exits, err } = await run(['login', 'openai-codex'], stubOAuth({
      login: vi.fn(async () => {
        throw new LlmError('denied', 'NO_OAUTH')
      }),
    }))
    expect(err).toMatch(/error: denied/)
    expect(exits).toEqual([1])
  })

  it('logs out of a provider', async () => {
    const { exits, out, oauth } = await run(['logout', 'openai-codex'])
    // eslint-disable-next-line @typescript-eslint/unbound-method -- test assertion against a vi.fn() mock
    expect(oauth.logout).toHaveBeenCalledWith('openai-codex')
    expect(out).toMatch(/Logged out of "openai-codex"/)
    expect(exits).toEqual([0])
  })

  it('writes a logout failure for a non-Error rejection', async () => {
    const { exits, err } = await run(['logout', 'openai-codex'], stubOAuth({
      logout: vi.fn(async () => {
        throw 'gone'
      }),
    }))
    expect(err).toMatch(/error: gone/)
    expect(exits).toEqual([1])
  })

  it('prints auth status', async () => {
    const { exits, out } = await run(['auth'], stubOAuth({
      list: vi.fn(async () => [{ providerId: 'openai-codex', type: 'oauth' as const }]),
    }))
    expect(out).toMatch(/openai-codex\s+logged in/)
    expect(exits).toEqual([0])
  })

  it('writes an auth failure', async () => {
    const { exits, err } = await run(['auth'], stubOAuth({
      list: vi.fn(async () => {
        throw new Error('store unreadable')
      }),
    }))
    expect(err).toMatch(/error: store unreadable/)
    expect(exits).toEqual([1])
  })

  it('prints help for login -h without running login', async () => {
    const { exits, oauth } = await run(['login', '-h'])
    // eslint-disable-next-line @typescript-eslint/unbound-method -- test assertion against a vi.fn() mock
    expect(oauth.login).not.toHaveBeenCalled()
    expect(exits).toEqual([0])
  })
})

describe('showStatus', () => {
  it('marks stored providers logged in and the rest logged out', async () => {
    let out = ''
    internals.stdout = { write: (chunk: string) => { out += chunk; return true } }
    await showStatus(stubOAuth({
      loginableProviders: () => [
        { id: 'openai-codex', name: 'OpenAI Codex' },
        { id: 'xai', name: 'xAI' },
      ],
      list: vi.fn(async () => [{ providerId: 'xai', type: 'oauth' as const }]),
    }))
    expect(out).toMatch(/openai-codex\s+logged out/)
    expect(out).toMatch(/xai\s+logged in/)
  })
})
