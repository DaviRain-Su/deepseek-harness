/**
 * Blank every pi-ai catalog API-key env var that is currently set, so plugin
 * apply's ambient registration cannot pick up the host's keys.
 */

import { vi } from 'vitest'
import { findEnvKeys } from '@earendil-works/pi-ai/compat'
import { catalogProviderIds } from '../src/catalog.ts'
import { OLLAMA_CLOUD_API_KEY_ENV } from '../src/ollama-cloud.ts'

/** Stub catalog key env vars to empty so a bare mount stays at zero routes. */
export function clearAmbientCatalogEnv(): void {
  for (const id of catalogProviderIds()) {
    for (const name of findEnvKeys(id) ?? []) vi.stubEnv(name, '')
  }
  vi.stubEnv(OLLAMA_CLOUD_API_KEY_ENV, '')
}
