/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-llm-oauth`.
 * @module @deepseek-ai/dsh-llm-oauth/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-oauth'

/** Cordis companion plugin name. */
export const name = 'llm-oauth-invariant'

/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * The store's durable write always republishes the changed provider into the
 * snapshot before notifying `llm/oauth-updated`, so an observer re-reads the
 * committed value. The one relationship worth asserting — a listener seeding a
 * provider-dir (path) from the auth store (file) — has no stream here to
 * check; the adapter-side invariant companion reconciles it.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
