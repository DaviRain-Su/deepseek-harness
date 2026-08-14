# Agent Note: TUI session picker

Status: implemented

English | [中文](2026-08-14-tui-session-picker.zh.md)

## Problem

The TUI created or resumed one Agent at start (`--resume` / `--session`) and then stayed on that id. Listing and switching required leaving the process. OMP's session picker is the daily path; copying its full-disk scan or terminal breadcrumb would invent a second catalog beside [`ctx.sessionQuery`](../../../../packages/session-query/session-query/README.md).

## Decision

`/sessions` and `/sessions <id>` call `ctx.sessionQuery` directly. The picker is `filterSessions` on this process cwd and `parent: null` (top-level only), plus `isSwitchableSession` so a subagent `origin` cannot appear. Titles come from `readTitleSnapshots`; a failed batch still lists ids. Selecting the current id is a no-op. A running turn notices `finish the current turn before switching sessions` and does not switch.

Switch resumes the next Agent first. A failed resume leaves the current Agent. After the next handle is idle, the TUI resets the transcript, subagent tracker, and stats listener, replays the new log, then flushes and disposes the previous handle. Inbox and tool-lookup closures read `this.agent` so they follow the switch. The runtime does not `inject(['sessionQuery'])` (the TUI settings race).

## Alternatives considered

**Re-exec `dsh --resume <id>`.** Rejected: source vs installed launch, bun vs Node, and FakeTerminal tests would each need a second process. In-process resume is the same factory `--resume` already uses.

**List every persisted session.** Rejected: the picker is this workspace's top-level conversations, not subagent children or other cwds.

**Auto-open the browser-style grouped workspace list.** Rejected: Web owns workspaces; the TUI picker is a flat cwd catalog.

## Consequences

Interactive `dsh` can switch conversations without restarting. `--resume` remains the launch path. A session from another cwd is still opened with `--resume <id>`. Slash autocomplete also offers user-invocable skill names ([TUI skill slash complete](2026-08-14-tui-skill-slash-complete.md)).

## Testing

`packages/bundle/tui/tests/sessions.spec.ts` pins cwd / parent / origin filtering and title vs id labels. `transcript.spec.ts` and `subagents.spec.ts` pin `reset()`. `tui.spec.ts` under `pnpm run test:tui` boots a FakeTerminal session: missing `sessionQuery` notices, picker Enter on the current id keeps the Agent, `/sessions <id>` refuses while running then switches and updates the header. There is still no keyless assembled TUI snapshot.

## Related

- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the one-session-at-start composition this overlay switches.
- [TUI login overlay](2026-08-14-tui-login-overlay.md) — the same overlay-command pattern.
- [TUI skill slash complete](2026-08-14-tui-skill-slash-complete.md) — slash catalog that also offers user-invocable skills.
