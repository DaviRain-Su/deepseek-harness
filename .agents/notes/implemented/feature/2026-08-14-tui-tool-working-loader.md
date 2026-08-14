# Agent Note: TUI working loader during tool calls

Status: implemented

English | [中文](2026-08-14-tui-tool-working-loader.zh.md)

## Problem

The [Thinking loader](2026-08-14-tui-working-indicator.md) hid on `tool/call` so a pending tool card could own the tail. That card is a static `●` / `❯` / `✎` box. A long `bash` or similar call then left the transcript motionless, which reads as a hang.

## Decision

`tool/call` keeps the same OMP `Loader` and relabels it with the newest unfinished card's `presentCall` title (`TranscriptView.pendingWorkLabel()`). `tool/result` restores the `Thinking` label while the turn is still busy. Streaming tokens still hide the loader: those rows are themselves motion. The pending card stays a status box; the spinner is the tail widget, not a second timer on the card.

## Alternatives considered

**Spinner on the pending `ToolCard` title.** Rejected: the `Loader` already owns the frame timer and `requestRender`. A second interval on every card would duplicate that clock.

**Footer-only activity.** Rejected by the original loader note: the user watches the transcript.

**Keep hiding on `tool/call`.** Rejected: the static card is not enough signal for a long-running call.

## Consequences

A live turn always shows a ticking tail row unless the model is streaming visible tokens. Parallel pending calls show the newest title.

## Testing

`tests/transcript.spec.ts` pins `pendingWorkLabel()` across call and result. `tests/tui.spec.ts` under `pnpm run test:tui` submits a held turn, applies `tool/call`, asserts `⠋` plus the call title and no `Thinking`, then applies `tool/result` and asserts `Thinking` returns. There is still no keyless assembled TUI snapshot of the ticking frames.

## Related

- [TUI Thinking loader and stream-paint scope](2026-08-14-tui-working-indicator.md) — the loader this call relabels.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the transcript this chrome sits in.
