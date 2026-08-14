/**
 * Configuration for `@deepseek-ai/dsh-llm-oauth`: the token document location
 * and hot-reload behavior. Defaulting happens in one explicit resolve step,
 * never inline.
 *
 * @module @deepseek-ai/dsh-llm-oauth/config
 */

import { join, resolve } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Basename of the token document inside the harness home. */
export const OAUTH_FILENAME = '.auth.yaml'

/** Fully resolved store parameters; defaulting happens in {@link resolveSpec}. */
export interface ResolvedSpec {
  /** Absolute path of the token document. */
  filename: string
  /** Whether external edits hot-reload. */
  watch: boolean
  /** Watcher write-settle window in milliseconds. */
  debounceMs: number
}

/**
 * Resolve the runtime spec from raw config: an explicit `path` wins, otherwise
 * the document lives at `<harness home>/.auth.yaml`.
 * @param config - raw plugin config.
 * @returns the resolved file location and watch behavior.
 */
export function resolveSpec(config: {
  path?: string
  dshHome?: string
  watch?: boolean
  debounceMs?: number
} = {}): ResolvedSpec {
  return {
    filename: resolve(config.path ?? join(resolveDshHome(config.dshHome), OAUTH_FILENAME)),
    watch: config.watch ?? true,
    debounceMs: config.debounceMs ?? 100,
  }
}

/** A provider route this seam can log into: an installed catalog provider with an OAuth flow. */
export interface LoginableProvider {
  /** Provider route key (pi-ai catalog id). */
  id: string
  /** Human display name of the subscription login. */
  name: string
  /** Login label a selector surface offers. */
  loginLabel?: string
}
