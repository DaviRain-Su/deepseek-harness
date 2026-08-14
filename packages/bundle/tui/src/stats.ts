/**
 * Footer stats-line formatting over the durable session projections
 * `token-meter` (tokenUsage / contextPressure) and `session-stats` own. One
 * home per figure: the projections survive paging and compaction, so the
 * footer mirrors the Web `StatsLine` + `ContextMeter` without re-folding the
 * log. All functions are pure over their projection inputs.
 *
 * @module @deepseek-ai/dsh-tui/stats
 */

import type {
  ContextBreakdownProjection,
  ContextPressureProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter'
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
 * sample, clamped to 100%. Capacity resolves `pressure.contextWindow` first,
 * then `preheatedWindow` so the row shows before the first request arrives,
 * since the projection only sets `contextWindow` from a `request/context`
 * record. Both numerator and capacity are independent last-wins projection
 * fields, so this is a reference figure, not one exact request.
 * @param pressure - the session's context-pressure projection, when registered.
 * @param preheatedWindow - the route capacity resolved from the live model
 *   selection before the first request, when `pressure.contextWindow` is absent.
 * @returns occupancy with its numerator and denominator, or null until both
 *   are known.
 */
export function contextOccupancy(
  pressure: ContextPressureProjection | undefined,
  preheatedWindow?: number,
): ContextOccupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextWindow = pressure?.contextWindow ?? preheatedWindow
  if (usedTokens === undefined || contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)),
    usedTokens,
    contextWindow,
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
 * `<tps> tok/s` (when decode was timed), `N turn(s)`,
 * `ctx N% <used>/<window>` (when both pressure and capacity are known), and
 * `~sys` / `~tools` / `~msg` (when any composition figure is non-zero).
 * The `~` prefix matches Web: these three are heuristic composition, not a
 * billed total, and they do not sum to `projectedTokens`.
 * @param usage - the session's token-usage projection, when registered.
 * @param pressure - the session's context-pressure projection, when registered.
 * @param stats - the session's whole-log stats projection, when registered.
 * @param preheatedWindow - the route capacity resolved from the live model
 *   selection, used for the `ctx` group before the first request arrives.
 * @param breakdown - the session's context-composition projection, when registered.
 * @returns the stats line, or '' when nothing to show.
 */
export function statsLine(
  usage: TokenUsageProjection | undefined,
  pressure: ContextPressureProjection | undefined,
  stats: SessionStatsProjection | undefined,
  preheatedWindow?: number,
  breakdown?: ContextBreakdownProjection,
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
  const occupancy = contextOccupancy(pressure, preheatedWindow)
  if (occupancy !== null) {
    groups.push(`ctx ${occupancy.percent}% ${formatTokens(occupancy.usedTokens)}/${formatTokens(occupancy.contextWindow)}`)
  }
  const composition = formatContextBreakdown(breakdown)
  if (composition !== '') groups.push(composition)
  return groups.join(' · ')
}

/**
 * Heuristic system / tools / messages composition, prefixed with `~` the
 * way Web's ContextMeter panel marks estimates. Hidden until any figure is
 * non-zero so a blank session does not grow the footer.
 * @param breakdown - the session's context-composition projection, when registered.
 * @returns the three groups joined by ` · `, or ''.
 */
export function formatContextBreakdown(
  breakdown: ContextBreakdownProjection | undefined,
): string {
  if (breakdown === undefined) return ''
  if (breakdown.systemTokens === 0 && breakdown.toolsTokens === 0 && breakdown.messageTokens === 0) {
    return ''
  }
  return [
    `~sys ${formatTokens(breakdown.systemTokens)}`,
    `~tools ${formatTokens(breakdown.toolsTokens)}`,
    `~msg ${formatTokens(breakdown.messageTokens)}`,
  ].join(' · ')
}
