# Agent Note: TUI /sessions opens subagent children

Status: implemented

English | [中文](2026-08-15-tui-sessions-subagent-children.zh.md)

## Problem

`/sessions` listed ordinary forks but hid `origin: 'subagent'`, so a persisted child run could not be resumed from the picker. [TUI Agent Hub](2026-08-15-tui-agent-hub.md) inspects a tracked run's transcript without switching the live Agent. [TUI /rename and /fork](2026-08-15-tui-rename-fork.md) deferred opening those children.

## Decision

`/sessions` lists every `filterSessions([])` row, including `origin: 'subagent'`. There is no header filter. A subagent-origin row's description includes a `subagent` mark. Selecting a row, or `/sessions <id>`, resumes in-process through the same `adoptHandle` path as any other conversation. A running turn still refuses. The process cwd does not change. The picker stays one flat searchable list — no Web-style tree, no parent grouping.

`/agents` remains the live-inspect overlay over `SubagentTracker.roster()`. A child whose agent is still registered fails resume loud through the existing notice, the same as any other register collision.

## Alternatives considered

**Keep subagent children off `/sessions` and only offer `/agents`.** Rejected: the hub is tracker-scoped and does not survive `--resume`; a persisted child is a session the query catalog already has.

**A parent-grouped tree overlay.** Rejected: SelectList has no disabled group headers, and a second overlay hides the fuzzy search that already matches title, id, and path.

**Adopt a live child handle instead of resume.** Rejected: the TUI owns one Agent handle; colliding with a still-registered child is a resume failure, not a second ownership path.

## Consequences

A persisted subagent child can become the live TUI session. `/agents` still does not switch. Ordinary forks and top-level conversations stay on the same list.

## Testing

`tests/sessions.spec.ts` pins the `subagent` description mark. `tests/tui.spec.ts` under `pnpm run test:tui` lists a subagent-origin row with forks and other-cwd rows, and `/sessions <id>` resumes a store-created child whose header `origin` is `subagent`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI session picker](2026-08-14-tui-session-picker.md) — the overlay and in-process resume this catalog now fills with children.
- [TUI /rename and /fork](2026-08-15-tui-rename-fork.md) — the leftover this note lands.
- [TUI Agent Hub](2026-08-15-tui-agent-hub.md) — inspect without switching.
- [TUI /sessions lists every recorded cwd](2026-08-14-tui-sessions-across-cwds.md) — cwd grouping is unchanged.
