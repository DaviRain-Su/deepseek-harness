# Agent Note: TUI /sessions lists every recorded cwd

Status: implemented

English | [中文](2026-08-14-tui-sessions-across-cwds.zh.md)

## Problem

Web groups conversations by workspace. The TUI `/sessions` picker only listed top-level sessions whose header cwd matched `process.cwd()`, so a session from another directory was invisible unless the user already knew the id and passed `--resume` or `/sessions <id>`.

## Decision

`filterSessions` keeps `parent: null` and drops the cwd clause. `isSwitchableSession` still hides a subagent `origin` and a `parentSession`. Rows sort with this process cwd (and a missing cwd) first, then other cwds alphabetically, newest `createdAt` inside a group. Each row's description includes `formatCwdForFooter` when the header recorded a cwd. Selecting a foreign-cwd row resumes in-process the same way `--resume <id>` does; the process working directory does not change.

## Alternatives considered

**Two-step workspace picker (cwd, then sessions).** Rejected this slice: SelectList has no disabled group headers, and a second overlay hides the fuzzy search that already matches title, id, and path in one list.

**`process.chdir` on switch.** Rejected: the TUI launch cwd is the tool workspace. `--resume` already restores another session without changing it.

**Keep the cwd filter.** Rejected: a known id was the only path to another workspace's conversation.

## Consequences

`/sessions` shows every top-level conversation the query service can see. Tools still run in the launch working directory after a foreign-cwd switch. Subagent children stay off the picker.

## Testing

`tests/sessions.spec.ts` pins top-level-only filtering, cwd group order, and cwd-in-description labels. `tests/tui.spec.ts` under `pnpm run test:tui` asserts `filterSessions` is called with `parent: null` only and that a `/other` row sorts after this cwd. There is still no keyless assembled TUI snapshot.

## Related

- [TUI session picker](2026-08-14-tui-session-picker.md) — the overlay and in-process resume this catalog now fills across cwds.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the one-session-at-start composition the picker switches.
