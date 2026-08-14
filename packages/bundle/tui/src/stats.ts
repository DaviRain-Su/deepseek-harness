/**
 * Footer stats-line formatting over the durable session projections
 * `token-meter` (tokenUsage / contextPressure) and `session-stats` own. One
 * home per figure: the projections survive paging and compaction, so the
 * footer mirrors the Web `StatsLine` + `ContextMeter` without re-folding the
 * log. All functions are pure over their projection inputs.
 *
 * @module @deepseek-ai/dsh-tui/stats
 */

import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'

/**
 * Compact token count mirroring the Web `formatTokens`: 517 / 12.2K / 517K / 1.2M
 * (one decimal under three digits).
 * @param n - token count.
 * @returns display string.
 */
export function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/**
 * Prompt-side billed tokens: the three disjoint input buckets.
 * @param usage - the session's token-usage projection.
 * @returns billed input tokens.
 */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Cache-hit share of prompt-side input over the whole durable log.
 * @param usage - the session's token-usage projection.
 * @returns rounded integer percent, or null when no input was billed.
 */
export function cacheHitPercent(usage: TokenUsageProjection): number | null {
  const denominator = billedInputTokens(usage)
  return denominator === 0 ? null : Math.round(usage.cacheReadTokens / denominator * 100)
}

/** Approximate context occupancy read from the pressure projection. */
export interface ContextOccupancy {
  /** Occupancy percent, clamped to 100. */
  percent: number
  /** Token numerator (`projectedTokens`, falling back to the bare sample). */
  usedTokens: number
  /** Route capacity from the latest `request/context` record. */
  contextWindow: number
}

/**
 * Approximate context occupancy, mirroring the Web `ContextMeter`: the
 * numerator is `projectedTokens` — the provider sample carried forward over
 * the surface's movement since — falling back to the bare `pressureTokens`
 * sample, clamped to 100%. Numerator and capacity are independent last-wins
 * projection fields, so this is a reference figure, not one exact request.
 * @param pressure - the session's context-pressure projection, when registered.
 * @returns occupancy with its numerator and denominator, or null until both
 *   are known.
 */
export function contextOccupancy(pressure: ContextPressureProjection | undefined): ContextOccupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

/**
 * Compact tokens-per-second: integer at 10+, one decimal under.
 * @param tps - tokens per second.
 * @returns display string.
 */
export function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/**
 * Build the compact footer stats line from durable projection values. Groups
 * with no data drop out whole, joined by ` · `. Returns '' when no token
 * activity and no context occupancy exist, so the footer renders no extra row
 * before the first billed turn.
 *
 * Groups: `cache N%` (when input was billed), `in <billed>` · `out <output>`,
 * `<tps> tok/s` (when decode was timed), `N turn(s)`, and
 * `ctx N% <used>/<window>` (when both pressure and capacity are known).
 * @param usage - the session's token-usage projection, when registered.
 * @param pressure - the session's context-pressure projection, when registered.
 * @param stats - the session's whole-log stats projection, when registered.
 * @returns the stats line, or '' when nothing to show.
 */
export function statsLine(
  usage: TokenUsageProjection | undefined,
  pressure: ContextPressureProjection | undefined,
  stats: SessionStatsProjection | undefined,
): string {
  const groups: string[] = []
  if (usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    const hit = cacheHitPercent(usage)
    if (hit !== null) groups.push(`cache ${hit}%`)
    groups.push(`in ${formatTokens(billedInputTokens(usage))}`)
    groups.push(`out ${formatTokens(usage.outputTokens)}`)
  }
  if (stats !== undefined) {
    if (stats.decodeMs > 0) {
      groups.push(`${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s`)
    }
    if (stats.turns > 0) groups.push(`${stats.turns} turn${stats.turns === 1 ? '' : 's'}`)
  }
  const occupancy = contextOccupancy(pressure)
  if (occupancy !== null) {
    groups.push(`ctx ${occupancy.percent}% ${formatTokens(occupancy.usedTokens)}/${formatTokens(occupancy.contextWindow)}`)
  }
  return groups.join(' · ')
}
