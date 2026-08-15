# Agent Note: TUI /todos lists the standing projection

Status: implemented

English | [中文](2026-08-15-tui-todos-picker.zh.md)

## Problem

The TUI footer already paints `N/M todos` from the standing `todos` projection. The chip is a count. `/jobs` lists the matching `ctx.jobs` rows; there was no command that showed the todo items themselves. Clicking the chip was rejected: the footer is text-only.

## Decision

`/todos` opens a picker over `sessionProjections.snapshot(session).values.todos`. Selecting a row notices `status · content`. The picker does not write the list; `todo_write` stays the model tool. Missing `ctx.sessionProjections`, a missing `todos` unit, and a null or empty list each notice. `/todos` stays off the header hints. `/help` lists it.

## Alternatives considered

**Clickable footer chips that open `/plan`, `/goal`, or `/todos`.** Rejected: the footer is text-only; mouse hit-testing would invent chrome. `/plan` and `/goal` already exist as host commands.

**Notice the whole list with no overlay.** Rejected: `/jobs` already uses the overlay-picker pattern for the same visibility job.

**A TUI verb that edits or clears todos.** Rejected: the standing list is last-write-wins from `todo_write`. A second writer would drift from the model-visible log.

## Consequences

A live TUI session can read the standing checklist the footer only counts. The next `turn/start` still clears the projection the way Web does; `/todos` then notices `no todos in this session`.

## Testing

`tests/status.spec.ts` pins `/todos` picker rows. `tests/tui.spec.ts` under `pnpm run test:tui` lists `/todos` on `/help`, notices a missing projection service, an unmounted unit, and an empty list, then opens a stub snapshot and notices the selected row. There is still no keyless assembled TUI snapshot.

## Related

- [TUI session status chips and /jobs](2026-08-14-tui-session-status-chips.md) — the count chip this command lists.
- [TUI session picker](2026-08-14-tui-session-picker.md) — the overlay-command pattern `/todos` reuses.
- [Todo plan clears on next turn](2026-07-28-todo-plan-clears-on-next-turn.md) — why a later `/todos` can be empty after `turn/start`.
