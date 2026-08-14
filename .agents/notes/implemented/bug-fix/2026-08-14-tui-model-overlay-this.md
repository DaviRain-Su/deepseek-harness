# Agent Note: `/model` keeps overlay helpers on the TUI instance

Status: implemented

English | [中文](2026-08-14-tui-model-overlay-this.zh.md)

## Problem

Typing `/model` aborted the TUI with `this.beginOverlayOperation is not a function` (`this.beginOverlayOperation` was `undefined`). The command handler called `openModelPicker` and discarded the promise, so the throw was an unhandled rejection and `dsh` reported a fatal load failure.

## Decision

`openModelPicker` and the overlay reservation helpers (`beginOverlayOperation`, `canCommitOverlay`, `finishOverlayOperation`, `invalidateOverlayOperation`) are instance arrows, so the slash-command and keybinding paths keep `this` as the live `TuiApp`. The `/model` handler `await`s the picker; a failure is a command error the transcript notices. Ctrl+P / Alt+P still fire-and-forget the same arrow and notice a rejection.

## Alternatives considered

**Leave TypeScript `private` / `async` prototype methods and bind in the constructor.** Rejected: the crash was `this.beginOverlayOperation` missing on the instance that ran `/model`; an instance arrow is the reservation, not a later `bind`.

**Keep `void this.openModelPicker()`.** Rejected: a throw then kills the process as an unhandled rejection. The command plane already notices handler failures when the handler is awaited.

## Consequences

`/model` opens the catalog picker without taking down the TTY. A listing or overlay failure stays in the transcript. The other interactive slash commands keep fire-and-forget handlers, but convert asynchronous login, logout, and session-picker failures into transcript notices instead of unhandled rejections.

## Testing

`packages/bundle/tui/tests/tui.spec.ts` under `pnpm run test:tui` submits `/model` (the command-plane path) and switches the live selection.

## Related

- [TUI live model catalog](../feature/2026-08-14-tui-live-model-catalog.md) — the picker this command opens.
- [TUI bun runtime and pi-ai catalog](../feature/2026-08-14-tui-omp-engine-and-catalog.md) — the bun process that loads this class from TypeScript.
