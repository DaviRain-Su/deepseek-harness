# Agent Note: TUI /settings Models panel

Status: implemented

English | [中文](2026-08-14-tui-settings-models-panel.zh.md)

## Problem

Web's Models page lists configurable LLM providers. The TUI already has `/login`, `/logout`, `/auth`, and `/model`, but `/settings` had no provider roster, so a user could not see which routes settings.yaml can configure without leaving the process.

## Decision

`/settings` adds a Models row between Appearance and Permission. Confirming it opens a picker over `ctx.llm.listConfigurableProviders()`. A missing `ctx.llm` notices `no LLM runtime is mounted`. Storing an API key is the [writable Models](2026-08-14-tui-writable-models.md) slice.

## Alternatives considered

**A writable Models page that edits `ctx.settings`.** Deferred in this slice so the roster existed first; shipped afterwards in [writable Models](2026-08-14-tui-writable-models.md).

**Reuse `/model`.** Rejected: `/model` lists live routes, not the configurable-provider directory. A dormant settings.yaml profile would stay invisible.

## Consequences

`/settings` lists Appearance, Models, Permission, Inventory, and Settings file when `documentPath` is set ([TUI settings file path](2026-08-14-tui-settings-file-path.md)). Models is the roster; credential writes live on the later note.

## Testing

`tests/settings.spec.ts` pins the hub order and `modelsRows`. `tests/tui.spec.ts` under `pnpm run test:tui` notices a missing LLM runtime from the Models row and opens the picker over a stub `listConfigurableProviders()`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable Models](2026-08-14-tui-writable-models.md) — storing an API key from a roster row.
- [TUI login overlay](2026-08-14-tui-login-overlay.md) — subscription OAuth, still the Login row.
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md) — `/model` lists live routes, not this directory.
- [TUI session status chips](2026-08-14-tui-session-status-chips.md) — the other TUI chrome slice in this change.
- [TUI settings file path](2026-08-14-tui-settings-file-path.md) — the hub row that names the local document.
