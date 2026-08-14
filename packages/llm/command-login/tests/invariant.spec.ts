import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as LoginInvariant from '@deepseek-ai/dsh-command-login/invariant'

describe('invariant companion', () => {
  it('registers the package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(LoginInvariant).await()).resolves.toBeDefined()
    expect(LoginInvariant.name).toBe('command-login-invariant')
    expect(LoginInvariant.inject).toEqual(['invariants'])
  })
})
