/** Footer stats-line formatting over durable session projections. */

import { describe, expect, it } from 'vitest'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'
import {
  billedInputTokens,
  cacheHitPercent,
  contextOccupancy,
  formatTokens,
  formatTokensPerSecond,
  statsLine,
} from '../src/stats.ts'

const usage = (over: Partial<TokenUsageProjection> = {}): TokenUsageProjection => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
})

const stats = (over: Partial<SessionStatsProjection> = {}): SessionStatsProjection => ({
  turns: 0,
  steps: 0,
  llmMs: 0,
  toolMs: 0,
  ttftMs: 0,
  ttftSteps: 0,
  decodeMs: 0,
  decodeTokens: 0,
  ...over,
})

describe('formatTokens', () => {
  it('mirrors the Web compact form: raw under 1K, one decimal K/M above', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(517)).toBe('517')
    expect(formatTokens(12_200)).toBe('12.2K')
    expect(formatTokens(100_000)).toBe('100K')
    expect(formatTokens(517_000)).toBe('517K')
    expect(formatTokens(1_200_000)).toBe('1.2M')
  })
})

describe('cacheHitPercent', () => {
  it('is the cache-read share of billed input, or null when nothing was billed', () => {
    expect(cacheHitPercent(usage())).toBeNull()
    expect(cacheHitPercent(usage({ uncachedInputTokens: 100 }))).toBe(0)
    expect(cacheHitPercent(usage({ cacheReadTokens: 900, uncachedInputTokens: 100 }))).toBe(90)
    expect(cacheHitPercent(usage({ cacheReadTokens: 500, cacheWriteTokens: 500 }))).toBe(50)
    expect(billedInputTokens(usage({ uncachedInputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3 }))).toBe(6)
  })
})

describe('contextOccupancy', () => {
  it('needs both a numerator and a capacity, clamps to 100', () => {
    expect(contextOccupancy(undefined)).toBeNull()
    expect(contextOccupancy({ pressureTokens: 1_000 })).toBeNull()
    expect(contextOccupancy({ contextWindow: 128_000 })).toBeNull()
    expect(contextOccupancy({ pressureTokens: 32_000, contextWindow: 128_000 })).toEqual({
      percent: 25, usedTokens: 32_000, contextWindow: 128_000,
    })
    expect(contextOccupancy({ projectedTokens: 6_000, pressureTokens: 32_000, contextWindow: 128_000 }))
      .toEqual({ percent: 5, usedTokens: 6_000, contextWindow: 128_000 })
    expect(contextOccupancy({ pressureTokens: 300_000, contextWindow: 128_000 })?.percent).toBe(100)
  })
})

describe('formatTokensPerSecond', () => {
  it('rounds to an integer at 10+, one decimal under', () => {
    expect(formatTokensPerSecond(0)).toBe('0')
    expect(formatTokensPerSecond(2.4)).toBe('2.4')
    expect(formatTokensPerSecond(12.6)).toBe('13')
  })
})

describe('statsLine', () => {
  it('is empty until a turn reports token activity or context occupancy', () => {
    expect(statsLine(undefined, undefined, undefined)).toBe('')
    expect(statsLine(usage(), undefined, stats())).toBe('')
  })

  it('groups cache hit, billed input/output, throughput, turns, and occupancy', () => {
    const line = statsLine(
      usage({ uncachedInputTokens: 100, cacheReadTokens: 900, outputTokens: 3_000 }),
      { projectedTokens: 48_000, contextWindow: 128_000 },
      stats({ turns: 3, decodeMs: 1_500, decodeTokens: 3_000 }),
    )
    expect(line).toBe('cache 90% · in 1K · out 3K · 2000 tok/s · 3 turns · ctx 38% 48K/128K')
  })

  it('drops groups with no data and keeps the separator count even', () => {
    // Billed input with no cache, no decode timing, no turns, no capacity.
    expect(statsLine(usage({ uncachedInputTokens: 5, outputTokens: 5 }), undefined, stats()))
      .toBe('cache 0% · in 5 · out 5')
    // No usage at all, no stats, only occupancy with a zero numerator.
    expect(statsLine(undefined, { pressureTokens: 0, contextWindow: 64_000 }, undefined))
      .toBe('ctx 0% 0/64K')
  })
})
