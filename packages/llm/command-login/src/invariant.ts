/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-command-login`.
 * @module @deepseek-ai/dsh-command-login/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-command-login'

/** Cordis companion plugin name. */
export const name = 'command-login-invariant'

/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Commands read `ctx.llmOAuth` (the store) and write through its locked
 * `modify`/`delete`; the store's own invariant companion owns the
 * publish-after-commit relationship. This surface adds no stream to assert.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
