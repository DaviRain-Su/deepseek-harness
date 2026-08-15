# Agent Note: TUI /new

Status: implemented

English | [中文](2026-08-15-tui-new-session.zh.md)

## Problem

`/sessions` only resumes a persisted top-level session. After `turn/start`, `/preset` is locked, and the TUI had no in-process path to a blank session. Leaving the process and launching again was the only way to pick another standing composition.

## Decision

`/new` calls `agents.create` with a fresh `session-${uuid}`, `cwd: process.cwd()`, and the roster default from `presets.resolve()` when `ctx.agentPresets` is mounted. Create runs first so a failure leaves the current Agent. `adoptHandle` then switches the live handle the same way `/sessions` does: wait until idle, reset transcript / subagent tracker / stats, replay the new log, notice `new session ${id}`, then flush and dispose the previous handle. A running turn notices `finish the current turn before starting a new session`. The process cwd does not change. A blank current session still gets a new id.

## Alternatives considered

**Add a create-new row to the `/sessions` picker.** Rejected: resume and create are different factories; a picker row that creates would hide that, and the command is the daily path after a locked `/preset`.

**Re-exec `dsh`.** Rejected for the same reason as [TUI session picker](2026-08-14-tui-session-picker.md): source vs installed launch, bun vs Node, and FakeTerminal tests would each need a second process.

**`process.chdir` or a workspace picker.** Rejected: `/new` keeps the launch working directory, same as `/sessions`.

**Inherit the current session's preset.** Rejected: the caller who needs `/new` after a lock wants the roster default so `/preset` can choose again.

## Consequences

A started TUI conversation can open a blank session without restarting. `/sessions` remains the resume catalog. Header hints include `/new` next to `/sessions`.

## Testing

`tests/chrome.spec.ts` pins `/new` in the header hints. `tests/tui.spec.ts` under `pnpm run test:tui` lists `/new` on `/help`, refuses while a turn is running, creates a new id and clears the previous transcript, and unlocks `/preset` after `/new` on a started session. There is still no keyless assembled TUI snapshot.

## Related

- [TUI session picker](2026-08-14-tui-session-picker.md) — the adopt path `/new` shares with resume.
- [TUI agent presets](2026-08-14-tui-agent-presets.md) — the blank-session lock `/new` resets.
- [TUI /sessions lists every recorded cwd](2026-08-14-tui-sessions-across-cwds.md) — `/new` also leaves the process cwd unchanged.
- [TUI /rename and /fork](2026-08-15-tui-rename-fork.md) — `/fork` copies this session instead of creating a blank one.
