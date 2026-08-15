# Agent Note: TUI /rename and /fork

Status: implemented

English | [中文](2026-08-15-tui-rename-fork.zh.md)

## Problem

The TUI could switch to a persisted conversation and open a blank one, but it had no in-process path to pin a title or copy the live log. Web already writes through [`ctx.sessionTitle.rename`](../../../../packages/session/session-title/README.md) and [`ctx.sessions.fork`](../../../../packages/core/session/README.md). Leaving the process to rename in another surface, or to start from a copied prefix, was the only option. `/sessions` also hid every `parentSession`, so a successful fork would vanish from the picker after the switch.

## Decision

`/rename [title]` calls `ctx.sessionTitle.rename` on the live session. A non-empty argument writes immediately. A blank argument opens the same text form other TUI writes use. A running turn may rename. Missing `ctx.sessionTitle` notices `session titles are not mounted`. A title that normalizes to empty notices the service error (`session title must contain visible characters`). The header still shows the session id; the pinned title is what `/sessions` folds.

`/fork` refuses while a turn is running (`finish the current turn before forking this session`), then calls `ctx.sessions.fork` on the live session (last completed-turn boundary; an empty source forks an empty child) and resumes the child through the same `adoptHandle` path as `/sessions` and `/new`. A failed fork or resume leaves the current Agent. The process cwd does not change. Header hints include `/fork` next to `/sessions`. `/rename` stays off the header.

`/sessions` calls `filterSessions([])` and lists ordinary forks. Opening `origin: 'subagent'` children is [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md).

## Alternatives considered

**Write the standing default from `/rename`.** Rejected: title is session-local; the settings default is a different store.

**Re-exec `dsh --resume` after fork.** Rejected for the same reason as [TUI session picker](2026-08-14-tui-session-picker.md): source vs installed launch, bun vs Node, and FakeTerminal tests would each need a second process.

**Put `/rename` on the header hints.** Rejected: the hint row is already crowded; `/help` lists the command.

**Open subagent-origin children from `/sessions`.** Owned by [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md): a flat list with a `subagent` mark, still no tree.

**Keep `parent: null` on the picker after `/fork`.** Rejected: the child would be unlisted after the switch.

## Consequences

A TUI conversation can pin its title and split at the last completed turn without restarting. `/sessions` lists the fork next to other conversations. `/new` remains the blank-session path.

## Testing

`tests/chrome.spec.ts` pins `/fork` in the header hints. `tests/tui.spec.ts` under `pnpm run test:tui` lists `/rename` and `/fork` on `/help`, notices a missing title service, writes a title from the argument and the form, refuses a blank title, refuses `/fork` while a turn is running, and copies history onto a child with `parentSession`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI session picker](2026-08-14-tui-session-picker.md) — the adopt path `/fork` shares with resume, and the picker filter that now keeps forks.
- [TUI /new](2026-08-15-tui-new-session.md) — the blank-session create path that `/fork` does not replace.
- [TUI /sessions lists every recorded cwd](2026-08-14-tui-sessions-across-cwds.md) — `/fork` also leaves the process cwd unchanged.
- [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md) — `/sessions` lists and resumes `origin: 'subagent'` children.
