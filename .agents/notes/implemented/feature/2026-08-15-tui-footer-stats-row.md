# Agent Note: TUI footer stats row over durable session projections

Status: implemented

English | [中文](2026-08-15-tui-footer-stats-row.zh.md)

## Problem

The Web UI surfaces per-session figures the TUI did not: cache-hit share, billed input and output token totals, decode throughput, turn count, and context occupancy. The TUI `SessionFooter` rendered only cwd and a busy/subagents/model row, and `applyEvent` ignored usage and request/context records. The durable folds already existed — `token-meter` registers `tokenUsage` / `contextPressure` / `contextBreakdown` and `session-stats` registers `sessionStats` through the shared `ctx.sessionProjections` seam, where they survive paging and compaction — but the TUI bundle never mounted `session-stats` and no TUI code read the seam, so the figures were unreachable in the terminal.

## Decision

The footer is now variable-height. `SessionFooter.render` paints cwd on the first row, the durable stats line on the second when present, and the busy/subagents/model row on the last. `SessionChrome` already computed its blank fill from `footer.length`, so the extra row needs no chrome change. The stats line is empty until the first turn reports token activity, so the footer stays two rows during onboarding.

`src/stats.ts` is the sole formatter, mirroring the Web `StatsLine` + `ContextMeter` math: `cacheHitPercent` is `cacheRead / (uncachedInput + cacheRead + cacheWrite)`, `contextOccupancy` takes `projectedTokens` falling back to `pressureTokens` over `contextWindow` clamped to 100%, and `formatTokens` / `formatTokensPerSecond` reuse the Web compact forms. The same line appends the heuristic `contextBreakdown` composition ([TUI footer context breakdown](2026-08-14-tui-context-breakdown.md)). `statsLine` drops each group whose data is absent and joins the rest with ` · `, returning `''` when nothing is showable.

`TuiApp.wireStats` reads one consistent `ctx.sessionProjections.snapshot(agent.session)` cut and subscribes to `onChanged`, filtering to the app's own session; each change calls `refreshStats` and `requestRender`. `stop` disposes the listener. The TUI consumes the seam; it owns no fold. `session-stats` is now mounted by the TUI patch (token-meter was already mounted by `dsh-base`), and `token-meter`, `session-projection`, and `session-stats` are declared as the bundle's dependencies and tsconfig references so the `SessionProjectionMap` augmentation types the snapshot values.

## Alternatives considered

**Fold the session log in the TUI to derive stats.** Rejected — the durable projections are one home per figure and already survive paging and compaction; re-folding in the TUI would duplicate that logic and diverge under compaction, exactly the failure the projections exist to prevent.

**Call `llm.resolveModelInfo` for the context window.** Rejected — `contextPressure.contextWindow` is carried by `request/context` records through the projection, so the occupancy numerator and denominator come from one consistent cut with no per-render route query.

**Pin the footer to three rows and blank the stats row before any turn.** Rejected — a permanent blank row wastes a transcript line during onboarding; the variable-height footer renders the row only when `statsLine` is non-empty, and `SessionChrome`'s fill math absorbs the height change.

**Show context occupancy on the model row alongside the effort label.** Rejected — the model label already carries `provider / model · effort`; appending occupancy would overflow narrow TTYs and mix route metadata with token accounting. The dedicated stats row keeps the two concerns separate, mirroring the Web split between `StatsLine` and `ContextMeter`.

## Consequences

The TUI footer now matches the Web UI's per-session stats display: cache-hit percent, billed input/output tokens, decode throughput, turn count, and context occupancy, all durable across paging and compaction. The TUI is a read-only consumer of the projection seam; adding `session-stats` to the TUI patch and the three projection packages to the bundle manifest is the only composition change. Status chips reuse `refreshStats` ([TUI session status chips](2026-08-14-tui-session-status-chips.md)).

## Testing

`tests/stats.spec.ts` pins the pure formatters: `formatTokens` compact form, `cacheHitPercent` null-on-no-billed and share math, `contextOccupancy` null-until-both-known and clamp, `formatTokensPerSecond` rounding, and `statsLine` group drop and join. `tests/chrome.spec.ts` asserts the footer inserts the stats row between cwd and the model row, truncates to width, and hides when cleared. `tests/tui.spec.ts` wires a stub `ctx.sessionProjections` through `bench()`, asserts the footer stays two rows before any turn, then three rows with `cache 90%`, `ctx 38% 48K/128K`, and `3 turns` once a billed turn's projection values arrive, and that a change for a different session is ignored. All under `pnpm run test:tui`; there is still no keyless assembled TUI snapshot, so the package-local semantic matrix pins this transient presentation per the testing policy.

## Related

- [Projected token usage and request context](2026-07-29-projected-token-usage-and-request-context.md) — the `tokenUsage` / `contextPressure` projections this row reads.
- [Replay token-meter service](2026-07-15-replay-token-meter-service.md) — the `ctx.tokenMeter` service that registers them.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the bundle this chrome ships on.
- [TUI `/model` effort picker and footer effort](2026-08-15-tui-model-effort-picker.md) — the other footer label component, unchanged here.
- [TUI session status chips](2026-08-14-tui-session-status-chips.md) — the accent row `refreshStats` also paints.
- [TUI footer context breakdown](2026-08-14-tui-context-breakdown.md) — the `~sys` / `~tools` / `~msg` groups on this line.