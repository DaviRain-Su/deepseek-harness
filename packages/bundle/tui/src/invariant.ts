/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tui`.
 * @module @deepseek-ai/dsh-tui/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tui'

/** Cordis companion plugin name. */
export const name = 'tui-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the terminal runtime is a process-level TTY owner
 * whose observable contract (raw-mode restore, session create/resume, exit)
 * is owned by the launcher e2e and package tests; it registers commands, a
 * user-questions provider, and an `approval/request` answerer through those
 * services' own disposal, and holds no additional mutable relation to audit
 * inside the tree.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
