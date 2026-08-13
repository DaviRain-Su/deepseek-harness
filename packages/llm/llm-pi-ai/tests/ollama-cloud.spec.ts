import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveConfig, resolveProfiles } from '../src/config.ts'
import {
  OLLAMA_CLOUD_API_KEY_ENV,
  OLLAMA_CLOUD_BASE_URL,
  OLLAMA_CLOUD_DISPLAY_NAME,
  OLLAMA_CLOUD_FALLBACK_MODEL,
  OLLAMA_CLOUD_ROUTE,
} from '../src/ollama-cloud.ts'
import { clearAmbientCatalogEnv } from './ambient.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

beforeEach(() => {
  clearAmbientCatalogEnv()
  vi.stubEnv('PI_TEST_KEY', 'test-key')
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await closeMockServers()
})

/** Direct adapter over the real profile resolver, with a fixed key per call. */
function adapterOf(
  providers: Record<string, LlmPiAi.PiAiProviderProfile>,
  apiKey: string | undefined = 'test-key',
): PiAiAdapter {
  return new PiAiAdapter({
    profiles: () => resolveProfiles(providers),
    resolveApiKey: () => Promise.resolve(apiKey),
  })
}

/** Scripted `GET /models` for the Cloud listing URL. */
function stubListing(body: unknown, status = 200): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    expect(url).toBe(`${OLLAMA_CLOUD_BASE_URL}/models`)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
}

describe('ambient Ollama Cloud', () => {
  it('registers ollama-cloud from OLLAMA_API_KEY and lets an explicit profile win', async () => {
    expect(resolveConfig({}, { ambientCatalog: true }).has(OLLAMA_CLOUD_ROUTE)).toBe(false)
    expect(resolveConfig({}).has(OLLAMA_CLOUD_ROUTE)).toBe(false)
    vi.stubEnv(OLLAMA_CLOUD_API_KEY_ENV, '   ')
    expect(resolveConfig({}, { ambientCatalog: true }).has(OLLAMA_CLOUD_ROUTE)).toBe(false)
    vi.stubEnv(OLLAMA_CLOUD_API_KEY_ENV, 'cloud-key')
    const resolved = resolveConfig({}, { ambientCatalog: true })
    const profile = resolved.get(OLLAMA_CLOUD_ROUTE)
    expect(profile?.displayName).toBe(OLLAMA_CLOUD_DISPLAY_NAME)
    expect(profile?.baseURL).toBe(OLLAMA_CLOUD_BASE_URL)
    expect(profile?.api).toBe('openai-completions')
    expect(profile?.apiKeyEnv).toBeDefined()
    expect(profile?.listsFromEndpoint).toBe(true)
    expect(profile?.piProvider.getModels().map(model => model.id)).toEqual([OLLAMA_CLOUD_FALLBACK_MODEL])
    expect(resolveConfig({}).has(OLLAMA_CLOUD_ROUTE)).toBe(false)
    const overlay = resolveConfig({
      providers: {
        [OLLAMA_CLOUD_ROUTE]: {
          displayName: 'My Cloud',
          apiKeyEnv: 'CUSTOM_OLLAMA_REF',
          api: 'openai-completions',
          baseURL: 'https://proxy.example/v1',
          models: [{ id: 'pinned' }],
        },
      },
    }, { ambientCatalog: true })
    expect(overlay.get(OLLAMA_CLOUD_ROUTE)?.displayName).toBe('My Cloud')
    expect(overlay.get(OLLAMA_CLOUD_ROUTE)?.listsFromEndpoint).toBeUndefined()
    const pinned = adapterOf({
      [OLLAMA_CLOUD_ROUTE]: {
        apiKeyEnv: 'PI_TEST_KEY',
        api: 'openai-completions',
        baseURL: 'https://proxy.example/v1',
        models: [{ id: 'pinned' }],
      },
    })
    vi.stubGlobal('fetch', async () => {
      throw new Error('explicit ollama-cloud catalogs do not interrogate')
    })
    await expect(pinned.listModels(OLLAMA_CLOUD_ROUTE)).resolves.toEqual([
      {
        provider: OLLAMA_CLOUD_ROUTE,
        id: 'pinned',
        name: 'pinned',
        inputModalities: ['text'],
      },
    ])
    const dumped = resolveConfig({ enableInstalledCatalog: true }, { ambientCatalog: true })
    expect(dumped.has(OLLAMA_CLOUD_ROUTE)).toBe(true)
    expect(dumped.has('openai')).toBe(true)
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, {})
    expect(ctx.llm.listProviders()).toContainEqual({
      id: OLLAMA_CLOUD_ROUTE,
      name: OLLAMA_CLOUD_DISPLAY_NAME,
    })
    await ctx.fiber.dispose()
  })

  it('lists Cloud models from the endpoint and falls back to the seed catalog', async () => {
    vi.stubEnv(OLLAMA_CLOUD_API_KEY_ENV, 'cloud-key')
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, {})
    stubListing({
      data: [
        { id: 'kimi-k2.6', name: 'Kimi K2.6' },
        { id: 'glm-5.2' },
      ],
    })
    await expect(ctx.llm.listModels(OLLAMA_CLOUD_ROUTE)).resolves.toEqual([
      {
        provider: OLLAMA_CLOUD_ROUTE,
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        inputModalities: ['text'],
      },
      {
        provider: OLLAMA_CLOUD_ROUTE,
        id: 'glm-5.2',
        name: 'glm-5.2',
        inputModalities: ['text'],
      },
    ])
    stubListing({ data: [] })
    await expect(ctx.llm.listModels(OLLAMA_CLOUD_ROUTE)).resolves.toEqual([
      {
        provider: OLLAMA_CLOUD_ROUTE,
        id: OLLAMA_CLOUD_FALLBACK_MODEL,
        name: OLLAMA_CLOUD_FALLBACK_MODEL,
        inputModalities: ['text'],
      },
    ])
    stubListing({}, 401)
    await expect(ctx.llm.listModels(OLLAMA_CLOUD_ROUTE)).resolves.toHaveLength(1)
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    await expect(ctx.llm.listModels(OLLAMA_CLOUD_ROUTE)).resolves.toHaveLength(1)
    const vision = adapterOf({
      [OLLAMA_CLOUD_ROUTE]: {
        apiKeyEnv: 'PI_TEST_KEY',
        api: 'openai-completions',
        baseURL: OLLAMA_CLOUD_BASE_URL,
        models: [{ id: OLLAMA_CLOUD_FALLBACK_MODEL }],
        listsFromEndpoint: true,
        defaultInput: ['text', 'image'],
      },
    })
    stubListing({ data: [{ id: 'kimi-k2.6' }] })
    await expect(vision.listModels(OLLAMA_CLOUD_ROUTE)).resolves.toEqual([
      {
        provider: OLLAMA_CLOUD_ROUTE,
        id: 'kimi-k2.6',
        name: 'kimi-k2.6',
        inputModalities: ['text', 'image'],
      },
    ])
    await ctx.fiber.dispose()
  })

  it('resolves and streams an id the seed catalog does not name', async () => {
    const server = await mockServer([{ events: textEvents }])
    const adapter = adapterOf({
      [OLLAMA_CLOUD_ROUTE]: {
        apiKeyEnv: 'PI_TEST_KEY',
        api: 'openai-completions',
        baseURL: server.url,
        models: [{ id: OLLAMA_CLOUD_FALLBACK_MODEL }],
        listsFromEndpoint: true,
        defaultInput: ['text'],
        defaultContextWindow: 131_072,
        defaultMaxTokens: 16_384,
        compat: { thinkingFormat: 'deepseek' },
      },
    })
    const info = await adapter.resolveModel(OLLAMA_CLOUD_ROUTE, 'kimi-k2.6')
    expect(info).toMatchObject({ provider: OLLAMA_CLOUD_ROUTE, id: 'kimi-k2.6', name: 'kimi-k2.6' })
    const seed = await adapter.resolveModel(OLLAMA_CLOUD_ROUTE, OLLAMA_CLOUD_FALLBACK_MODEL)
    expect(seed.id).toBe(OLLAMA_CLOUD_FALLBACK_MODEL)
    const assembler = new BlockAssembler()
    for await (const chunk of adapter.stream({
      provider: OLLAMA_CLOUD_ROUTE,
      model: 'kimi-k2.6',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })) assembler.push(chunk)
    expect(assembler.message({
      kind: 'model',
      provider: OLLAMA_CLOUD_ROUTE,
      model: 'kimi-k2.6',
    }).content).toEqual([{ type: 'text', text: 'hello' }])
    expect(server.paths).toEqual(['/chat/completions'])
  })

  it('synthesizes an unlisted id on a catalog route that lists from its endpoint', async () => {
    const adapter = adapterOf({ openai: { listsFromEndpoint: true } })
    const info = await adapter.resolveModel('openai', 'not-a-catalog-model')
    expect(info).toMatchObject({ provider: 'openai', id: 'not-a-catalog-model' })
    await expect(adapter.listModels('openai')).resolves.not.toHaveLength(0)
  })
})
