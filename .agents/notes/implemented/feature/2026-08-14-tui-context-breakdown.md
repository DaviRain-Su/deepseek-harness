# Agent Note: TUI footer context breakdown

Status: implemented

English | [中文](2026-08-14-tui-context-breakdown.zh.md)

## Problem

Web's ContextMeter panel shows the heuristic `contextBreakdown` split (`systemTokens` / `toolsTokens` / `messageTokens`). The TUI footer already painted total occupancy from `contextPressure` and left the composition unread, so a long system prompt or tool schema looked the same as a long conversation.

## Decision

`statsLine` appends `~sys` / `~tools` / `~msg` from the same `ctx.sessionProjections` cut the occupancy group already reads. The `~` prefix matches Web: the three figures are the meter's fixed heuristic and do not sum to `projectedTokens`. The group is omitted while all three are zero so a blank session stays two footer rows. There is no second footer row and no overlay.

## Alternatives considered

**A click-open panel like Web's ContextMeter.** Rejected: the TUI has no pointer-owned composer chrome; the stats line is the existing home for token figures.

**A fourth footer row.** Rejected: occupancy and composition are one cut; a dedicated row would hide transcript for a split the stats line already has room to show.

**Summing the three figures as a second total.** Rejected: token-meter documents that they will not match `projectedTokens`; presenting a sum would look like a billed total.

## Consequences

The durable stats row shows both occupancy and composition. The TUI still owns no fold. Locale, Trajectory, attachments, and Like/Dislike stay documented TUI limitations.

## Testing

`tests/stats.spec.ts` pins hide-when-zero and the `~` compact form. `tests/tui.spec.ts` asserts the wired footer contains the three groups once a stub snapshot carries `contextBreakdown`. All under `pnpm run test:tui`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI footer stats row](2026-08-15-tui-footer-stats-row.md) — the variable-height stats line this group joins.
- [Composer context-meter breakdown](2026-08-05-composer-context-meter-breakdown.md) — the Web panel and the `contextBreakdown` projection.
