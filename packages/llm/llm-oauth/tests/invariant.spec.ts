import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as OAuthInvariant from '@deepseek-ai/dsh-llm-oauth/invariant'

describe('invariant companion', () => {
  it('registers the package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(OAuthInvariant).await()).resolves.toBeDefined()
    expect(OAuthInvariant.name).toBe('llm-oauth-invariant')
    expect(OAuthInvariant.inject).toEqual(['invariants'])
  })
})
