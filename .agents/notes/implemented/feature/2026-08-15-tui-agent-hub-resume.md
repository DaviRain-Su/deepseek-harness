# Agent Note: TUI Agent Hub survives --resume

Status: implemented

English | [中文](2026-08-15-tui-agent-hub-resume.zh.md)

## Problem

The Agent Hub lists only the runs the in-memory `SubagentTracker` holds. `subagent/start` and `subagent/end` are transient scoped agent events, so `--resume` repopulates neither the tracker nor the hub roster, and selecting a row could not open a child whose session was not resident. The prior [TUI Agent Hub](2026-08-15-tui-agent-hub.md) note deferred this as a known limitation.

## Decision

Rebuild the roster from the durable child enumeration, not from a new durable event. `openAgentHub` merges `SubagentTracker.roster()` — the live entries with rich `thinking` / `running <tool>` status — with `SubagentRuntime.listChildren(parentSessionId)`, the projection-backed enumeration of every durable child (live and cold, with label and mode), deduplicating by child session id. Children the tracker lost on `--resume` reappear from `listChildren`; children in the creation window before their descriptor is appended still appear from the tracker.

`openAgentTranscript` no longer takes a live `Session`; `AgentTranscriptOverlay` takes a `readonly SessionEvent[]`. A new `SubagentRuntime.loadChildEvents(childId, signal?)` returns the child's events: the resident session's events from `ctx.get('sessions')` when live, otherwise one `sessionPersistence.inspect` read for a cold child. The overlay replays those events; the `session/event` listener keeps folding live events while it is open. A child whose events cannot be loaded (no live session and no persistence row) notices instead of opening.

Both openers are now async and guard the open with `overlayOpening` across the enumeration and the persistence read, so a concurrent opener cannot race the awaited result.

- No `SessionEventMap` change, no `lifecycle.ts` change: `subagent/start` and `subagent/end` stay transient. The durability comes from the existing `listChildren` corpus, which is already production-tested by the session-query path.
- `loadChildEvents` is read-only, performs no projection fold or lifecycle validation, and returns `undefined` — not an error — when neither a live session nor a persistence row exists, so a vanished child is capability absence for the hub.
- The live fallback in `openAgentTranscript` (`ctx.get('sessions')?.get(childId)?.events`) keeps the hub working in compositions that mount the session store but not `SubagentRuntime`, where `loadChildEvents` is unreachable.

## Alternatives considered

**Make `subagent/start` / `subagent/end` durable session events appended to the parent log.** Rejected: `lifecycle.ts` would append through `parent.session`, but the parent is a live `Agent` in production and a bare `{ id }` fake in `service.spec.ts`, so the append would break every lifecycle unit test unless the whole subagent suite gained a real `SessionStore`. It also adds two `SessionEventMap` members across both packages' type graphs. The marginal value — rebuilding the one-line `⏵` run card on resume, beside the delegation's durable `tool/call` + `tool/result` that already replay in the parent transcript — did not justify the contract change.

**Persist the lifecycle in the child log instead of the parent log.** Rejected: the parent transcript replays only the parent log, so child-log events would not rebuild anything on the parent side; the hub's `loadChildEvents` already reads the child log and is the real drill-in.

## Consequences

`SubagentRuntime` gains `loadChildEvents(childId, signal?)`. `AgentTranscriptOverlay` takes `readonly SessionEvent[]` instead of `Session`. `TuiApp.openAgentHub` and `openAgentTranscript` are async and merge the tracker with `listChildren`. The [TUI Agent Hub](2026-08-15-tui-agent-hub.md) note's `--resume` limitation and its "Reconstruct the hub on `--resume`" alternative now point here. The parent-side `⏵` run cards still do not rebuild on `--resume`; the delegation's durable tool call and result remain the visible parent-side trace.

## Testing

`packages/subagent/subagent/tests/list-children.spec.ts` covers `loadChildEvents` for a resident child, a cold child inspected from persistence, an unknown id (inspect rejects → `undefined`), and a context with neither store nor persistence. `packages/bundle/tui/tests/tui.spec.ts` covers the merged roster picker, the overlay replaying the child log through the live fallback, and live event folding.

## Known limitations and deferred work

The parent-side `⏵` run cards do not rebuild on `--resume`; only the hub does. A child deleted and re-published under the same id returns whatever that id currently holds; `loadChildEvents` does not validate lifecycle the way `listChildren` does, because a read-only inspect favors availability over a stale-identity refusal.

## Related

- [TUI Agent Hub](2026-08-15-tui-agent-hub.md) — the live hub this extends to `--resume`; its `--resume` limitation is resolved here.
- [TUI subagent run cards](2026-08-14-tui-subagent-run-cards.md) — the parent-side at-a-glance layer, still live-only on `--resume`.