# Agent Note: TUI session status chips and /jobs

Status: implemented

English | [中文](2026-08-14-tui-session-status-chips.zh.md)

## Problem

Web paints plan, goal, todos, and background jobs in composer chrome. The TUI already runs the same dsh-base units — `/plan`, `/goal`, `todo_write`, and `ctx.jobs` — but the footer only showed cwd, token stats, and the model. A pending `/plan`, a standing goal, or a live bash job had no persistent TUI status.

## Decision

The footer inserts an accent chip row above the model row from the current `plan` / `goal` / `todos` projection cut and `ctx.jobs.list(agent)`. `/jobs` opens a picker over that same list; selecting a row notices status, label, and detail. `/plan` and `/goal` stay the host commands. A missing projection or `ctx.jobs` omits that chip and `/jobs` notices `jobs are not mounted`. The jobs listener is process-wide; `refreshStatus` keeps the live Agent. The picker does not cancel work.

## Alternatives considered

**GoalBar verbs and a plan-mode toggle in the TUI.** Rejected: `/plan` and `/goal` already exist on the command plane. This change is visibility, not a second control path.

**Kill from the `/jobs` picker.** Rejected: cancellation stays with the jobs tools. The picker is a read of `list()`.

**A TUI-owned status store.** Rejected: the projections and `ctx.jobs` are already the source Web reads. A second store would drift on `/sessions` switch and replay.

## Consequences

A live TUI session shows `plan` / `plan…`, `goal <objective>` (or `goal <phase> <objective>` when the durable phase is not `active`), `N/M todos`, and `N jobs` / `N jobs done` when those facts exist. dsh-base mounts the units, so an ordinary interactive `dsh` sees the chips without extra composition.

## Testing

`tests/status.spec.ts` pins chip wording and `/jobs` picker rows. `tests/chrome.spec.ts` pins the `/jobs` header hint and the accent row between stats and the model. `tests/tui.spec.ts` under `pnpm run test:tui` notices a missing or empty jobs service, lists a live job and paints `1 jobs`, and paints plan / goal / todo chips from a projection snapshot. There is still no keyless assembled TUI snapshot.

## Related

- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the footer these chips join.
- [TUI session picker](2026-08-14-tui-session-picker.md) — the overlay-command pattern `/jobs` reuses.
- [TUI footer stats row](2026-08-15-tui-footer-stats-row.md) — the durable stats row the chips sit under.
- [TUI /settings Models panel](2026-08-14-tui-settings-models-panel.md) — the settings-hub roster shipped beside these chips.
