# Agent Note: TUI append into a running turn

Status: implemented

English | [中文](2026-08-14-tui-busy-append.zh.md)

## Problem

The TUI editor stays usable while an Agent turn is running, but Enter always called `agent.followup()`, which queues a **next-turn** item. That item is invisible until the current multi-step turn finishes and the durable `user/message` lands. Ctrl+C `cancel({ kind: 'user' })` also drops the unclaimed inbox, so a typed-while-busy line could vanish with no transcript row. Pi, Codex, and similar products steer newly typed input into the current turn at the next step. The engine already exposes that path as `agent.steer()`; Web uses it for busy composer input ([web-queue-steer-action](2026-07-30-web-queue-steer-action.md)). The TUI never called it.

## Decision

`TuiApp.submit` sends non-slash text through `agent.steer()` when `agent.status === 'running'`, and through `agent.followup()` when idle. Slash commands are unchanged. `steer()` is best-effort: a closed next-step window reclassifies the same message as a waking next-turn follow-up, matching the engine and the Web composer's newly typed input.

`TranscriptView` paints a dim italic pending row for a user-source inbox insert that arrives while the Agent is running: `appending · {text}` when the id is in `inbox.nextStep`, otherwise `queued · {text}`. Idle Enter does not use a pending row; submit paints the user bubble immediately ([working indicator](2026-08-14-tui-working-indicator.md)). The pending row dismisses on `agent/inbox/claimed`, `agent/inbox/discarded`, and the matching durable `user/message`; `PendingInputBlock.dismiss` makes later renders empty. `TuiApp` listens unscoped on those inbox events and filters `agent === this.agent`. The busy footer reads `enter append · ctrl+c cancel`. Ctrl+C still cancels without `keepInbox`, so unclaimed pending rows disappear with the inbox.

## Alternatives considered

**Keep Enter on `followup()` and only paint a Queue row.** Rejected because the user intent while the Agent is working is to join the current turn, not to wait for a new one. The engine already distinguishes the two targets.

**Idle Enter also calls `steer()`.** Rejected because idle `steer()` starts a turn as next-step input. The conservative split matches Web's idle composer: first/idle lines are ordinary follow-ups; only a running turn steers.

**Port Web QueueDock edit/remove and a strict row-steer action.** Rejected. Newly typed TUI input has no queued occurrence to preserve; `agent.steer()`'s follow-up fallback is the contract the Web note already assigned to TUI callers.

**Show pending rows for idle follow-ups too.** Rejected because that would flash `queued ·` before the user bubble on every ordinary send. Idle delivery does not use a pending row.

## Consequences

Busy Enter joins the current turn at the next step boundary rather than after `turn/end`. Unclaimed steering still dies on Ctrl+C. There is still no in-transcript edit/remove of pending rows and no keyless assembled TUI snapshot; package tests under `pnpm run test:tui` pin submit-while-running, pending paint/dismiss, and the footer hint.

## Testing

`tests/transcript.spec.ts` pins pending paint, empty-text no-op, duplicate-id no-op, dismiss idempotence, and durable `user/message` handoff. `tests/tui.spec.ts` holds the first turn, asserts busy Enter appends `next-step` and paints `appending`, claim clears that row, a running next-turn insert paints `queued`, and Ctrl+C discard clears it. `tests/chrome.spec.ts` pins `enter append` on the busy stats row.

## Related

- [Steer a queued Web message into the active turn](2026-07-30-web-queue-steer-action.md) — Web Queue vs composer `steer()`; this note is the TUI consumer of best-effort `agent.steer()`.
- [TUI Thinking loader and stream-paint scope](2026-08-14-tui-working-indicator.md) — idle Enter paints the user bubble immediately; this note owns busy pending rows.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the bundle this input path ships on.
