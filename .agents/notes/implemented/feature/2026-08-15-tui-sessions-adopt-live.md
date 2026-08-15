# Agent Note: TUI /sessions adopts a live registered agent

Status: implemented

English | [中文](2026-08-15-tui-sessions-adopt-live.zh.md)

## Problem

`/sessions` always called `agents.resume`. A child whose agent was still registered — a live subagent — threw `already registered`. [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md) listed those rows and treated the collision as a resume failure.

## Decision

`switchSession` uses `ctx.agents.get(id)` first. A hit borrows that Agent with a no-op disposer and parks the previous TUI-owned handle so disposing the parent cannot tear down a still-running child. Switching back to a parked id restores the owned handle. A miss still resumes. A running TUI turn still refuses. `/agents` still does not switch.

A borrowed Agent that is already `running` is shown live; `adoptHandle` does not wait for `whenIdle`.

## Alternatives considered

**Keep the collision as a loud resume failure.** Rejected: the catalog already offers the row, and `/agents` cannot become the live session.

**Dispose the previous handle when borrowing.** Rejected: the previous Agent is often the child's owner; disposing it cancels the work the user just opened.

**A second TUI-owned resume beside the live child.** Rejected: `register` forbids two agents on one session id.

## Consequences

`/sessions` to a live subagent child becomes that session without a second factory call. Quit disposes parked TUI-owned handles and the current handle. Borrowed disposers stay no-ops.

## Testing

`tests/tui.spec.ts` under `pnpm run test:tui` resumes a store-created child so it is registered, `/sessions` adopts that exact Agent, the parent stays registered, and switching back restores the parent. There is still no keyless assembled TUI snapshot.

## Related

- [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md) — the catalog this path now opens when the child is live.
- [TUI Agent Hub](2026-08-15-tui-agent-hub.md) — inspect without switching.
