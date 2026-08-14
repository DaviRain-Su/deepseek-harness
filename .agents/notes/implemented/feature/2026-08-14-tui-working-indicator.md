# Agent Note: TUI Thinking loader and stream-paint scope

Status: implemented

English | [中文](2026-08-14-tui-working-indicator.zh.md)

## Problem

After Enter, the TUI transcript stayed static until the durable `user/message` and the first token. The footer only showed `enter append · ctrl+c cancel`. Theme already exposed `spinnerFrames`, but nothing animated, so a fast model still looked idle and the user could not tell the Agent was working. Every live `assistant/chunk` called full `tui.requestRender()`, and Markdown re-lexed every delta.

## Decision

`TuiApp` mounts an OMP `Loader` as the last child of the transcript container, labelled `Thinking`, with accent spinner color, dim message color, and `TUI_SYMBOL_THEME.spinnerFrames`. Submit, `step/start`, `user/message`, and `tool/result` show or lift it (`removeChild` then `addChild`). The first non-empty `reasoning-delta` or `text-delta`, `turn/end`, Ctrl+C, and `stop()` hide it (`Loader.stop` / `dispose`). A `tool/call` keeps the same loader and relabels it ([working loader during tool calls](2026-08-14-tui-tool-working-loader.md)). A busy inbox pending row also lifts the loader so it stays at the tail.

Idle Enter calls `transcript.paintUser(line)` before `followup()`. A later `user/message` with the same text is skipped (`lastPaintedUser`). Busy Enter still uses the pending `appending` / `queued` rows from [TUI append into a running turn](2026-08-14-tui-busy-append.md), not a second bubble.

Live `assistant/chunk` text and reasoning deltas call `tui.requestComponentRender(transcriptMount)` instead of a full tree render. `AssistantMessageBlock` sets Markdown `transientRenderCache` while streaming and `settle()` on the live `assistant/message`. OSC `setProgress` is on while this turn is busy or a subagent run is live.

## Alternatives considered

**Footer-only spinner.** Rejected because the user watches the transcript, not the stats row.

**Reuse `ThinkingBlock` as the wait indicator.** Rejected because that block is the durable `reasoning-delta` body. Mixing wait-state and reasoning would show an empty Thinking heading that then grows into model thoughts.

**Port the Web QueueDock activity chrome.** Rejected; the TUI has no dock, and the missing signal is in-transcript motion plus a cheaper stream paint.

**Keep full-tree `requestRender` on every chunk.** Rejected because that is the path that stayed expensive on a fast model; subtree paint plus transient Markdown cache is the shipped fix.

**Wait for durable `user/message` before painting the idle bubble.** Rejected because time-to-first-token still leaves a blank transcript after Enter.

## Consequences

The transcript shows motion while the model is silent, then yields to tokens. A pending tool call keeps the spinner ([working loader during tool calls](2026-08-14-tui-tool-working-loader.md)). Loader timers start in the `Loader` constructor, so `stop()` must `hideWorking` — including tests that never `quit`. There is still no keyless assembled TUI snapshot; package tests under `pnpm run test:tui` pin the indicator.

## Testing

`tests/transcript.spec.ts` pins `paintUser` skip of the matching durable `user/message` and `AssistantMessageBlock.settle()`. `tests/tui.spec.ts` asserts `Thinking` and `⠋` after idle submit, hide on the first `text-delta` and on Ctrl+C, keep-and-relabel on `tool/call`, and OSC progress while busy. `tests/theme.spec.ts` pins `spinnerFrames`.

## Related

- [TUI working loader during tool calls](2026-08-14-tui-tool-working-loader.md) — the same loader stays up while a tool runs.
- [TUI append into a running turn](2026-08-14-tui-busy-append.md) — busy pending rows; this note owns idle optimistic paint and the wait loader.
- [TUI bun runtime and pi-ai catalog](2026-08-14-tui-omp-engine-and-catalog.md) — OMP `Loader` / `spinnerFrames` and `ThinkingBlock` for actual reasoning.
- [TUI subagent run cards](2026-08-14-tui-subagent-run-cards.md) — shares OSC progress with live subagent runs.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the bundle this chrome ships on.
