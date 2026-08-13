/**
 * Ambient registration of hosted Ollama Cloud. pi-ai ships no `ollama` catalog
 * id, so a set `OLLAMA_API_KEY` cannot ride the installed-provider loop; this
 * module is the declared OpenAI-compatible route that loop cannot produce.
 *
 * @module dsh-llm-pi-ai/ollama-cloud
 */

import type { PiAiProviderProfile } from './config.ts'

/** Route key for hosted ollama.com. Distinct from a future local-daemon `ollama`. */
export const OLLAMA_CLOUD_ROUTE = 'ollama-cloud'

/** Credential environment variable Ollama Cloud issues at https://ollama.com/settings/keys. */
export const OLLAMA_CLOUD_API_KEY_ENV = 'OLLAMA_API_KEY'

/** OpenAI-compatible Chat Completions base, including the `/v1` prefix. */
export const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/v1'

/** Selector label; the route key stays `ollama-cloud`. */
export const OLLAMA_CLOUD_DISPLAY_NAME = 'Ollama Cloud'

/**
 * Seed model so a declared route is serviceable before listing answers, and
 * the fallback `/model` offers when interrogation fails. Direct Cloud ids
 * omit the `:cloud` suffix that a local daemon uses for offload.
 */
export const OLLAMA_CLOUD_FALLBACK_MODEL = 'gpt-oss:120b'

/**
 * The ambient `ollama-cloud` stub when `OLLAMA_API_KEY` is already set.
 * `listsFromEndpoint` is not a settings field: the schema does not accept it,
 * so a written `providers.ollama-cloud` overlay cannot set it and keeps a
 * snapshot catalog.
 * @returns the stub, or `undefined` when the key is missing or blank.
 */
export function ambientOllamaCloudProfile(): PiAiProviderProfile | undefined {
  const value = process.env[OLLAMA_CLOUD_API_KEY_ENV]
  if (value === undefined || value.trim() === '') return undefined
  return {
    displayName: OLLAMA_CLOUD_DISPLAY_NAME,
    apiKeyEnv: OLLAMA_CLOUD_API_KEY_ENV,
    api: 'openai-completions',
    baseURL: OLLAMA_CLOUD_BASE_URL,
    models: [{ id: OLLAMA_CLOUD_FALLBACK_MODEL }],
    listsFromEndpoint: true,
  }
}
