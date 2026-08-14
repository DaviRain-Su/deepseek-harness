# Agent Note: TUI overlay and Agent lifecycle safety

Status: implemented

English | [中文](2026-08-15-tui-overlay-and-agent-lifecycle.zh.md)

## Problem

The interactive TUI opened model, session, and logout pickers after asynchronous catalog reads. A second opener, an approval prompt, or TUI disposal could change the focused overlay while that read was pending; the stale continuation could then publish an orphaned picker or replace the live handle. Permission settings also read an optional service through the topology-sensitive context property, and a failed `followup()` or `steer()` left the working indicator active because no durable turn event would clear it.

The TUI owned the `AgentHandle` returned by `ctx.agents.create()` or `resume()`, but normal `/exit`, Ctrl+D, and in-process fiber disposal did not all await that handle's quiescent disposer. Process exit often hid the leak, while tests and hosts that retained the context could keep the loop and scoped Agent world alive.

## Decision

`TuiApp` reserves one asynchronous overlay operation at a time. The reservation captures the TUI renderer and a generation number; hiding or replacing an overlay invalidates the generation. A continuation publishes only when the renderer, generation, stopped state, and empty focused-overlay slot still match. Synchronous overlay openers respect the same reservation, so a pending catalog read cannot be overtaken by another picker. Model-effort resolution uses the same operation. The login interaction also receives the TUI abort signal, so a provider waiting before its first prompt is cancelled by teardown.

Optional permission presets are read through `ctx.get('permissionPresets')`. A composition without that service reports `permission presets are not mounted` and leaves the settings hub closed.

`TuiApp.quit()` stops the renderer, flushes the current session, and awaits the owned handle disposer before requesting process exit. `TuiApp.dispose()` provides the same quiescent teardown for the plugin effect; repeated disposal callers share one in-flight promise. The stop-only method remains synchronous so input callbacks can request terminal restoration without awaiting it.

Interactive slash-command handlers keep login, logout, and session switching in the background so their overlays remain usable; each attaches a rejection handler that renders asynchronous failures as notices. User-message admission is contained. If constructing or delivering a message throws, the TUI clears busy state and the working loader and renders a notice instead of leaving a turn indicator with no possible `turn/end`.

## Alternatives considered

**Only re-checking state after each await.** Rejected because multiple callers can pass the initial check before any one of them publishes. A reservation and generation also cover approval or disposal invalidating a pending continuation.

**Relying on the owner fiber to dispose every Agent.** Rejected because `/exit` and Ctrl+D are in-process operations whose session flush and handle disposal must complete before the launcher receives the exit request; fiber disposal is not the only teardown path.

**Adding a non-TTY snapshot override.** Rejected because it would not exercise the shipped interactive path. The current assembled snapshot runner uses Node with closed stdin, while the TUI requires a real TTY and Bun; a faithful snapshot needs a PTY input-replay runner and belongs to a separate test-infrastructure change.

## Consequences

Overlay continuations cannot publish into a replaced renderer or overwrite another focused overlay. A pending read is discarded when the TUI stops. In-process exits now wait for Agent quiescence after the session flush. A failed message admission is visible and leaves the UI idle.

The TUI still has no keyless assembled transcript snapshot. The package semantic matrix and the CLI's assembled non-TTY failure checks remain the available evidence until a Bun-plus-PTY snapshot lane exists.

## Testing

`tests/tui.spec.ts` covers duplicate and disposal-racing model picker opens, missing and mounted permission-preset paths, message-admission failure cleanup, fiber teardown Agent disposal, and normal quit disposal. The existing TUI package suite passes with these cases included.

## Related

- [Shipped interactive TUI profile](../feature/2026-08-13-shipped-tui-profile.md) — composition and existing assembled-entry limitations.
- [TUI append into a running turn](../feature/2026-08-14-tui-busy-append.md) — busy `steer()` and `followup()` ownership.
- [TUI settings hub](../feature/2026-08-15-tui-settings-hub.md) — Permission panel consumer.
- [`/model` overlay instance binding](2026-08-14-tui-model-overlay-this.md) — command and keybinding ownership for the same overlay helpers.
- [Agent lifecycle and ownership contracts](../architecture/2026-06-18-agent-lifecycle-and-ownership-contracts.md) — `AgentHandle` ownership and quiescence.
