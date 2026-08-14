# Agent Note: TUI /settings Models panel

Status: implemented

English | [中文](2026-08-14-tui-settings-models-panel.zh.md)

## Problem

Web's Models page lists configurable LLM providers. The TUI already has `/login`, `/logout`, `/auth`, and `/model`, but `/settings` had no provider roster, so a user could not see which routes settings.yaml can configure without leaving the process.

## Decision

`/settings` adds a Models row between Appearance and Permission. Confirming it opens a read-only picker over `ctx.llm.listConfigurableProviders()`. Selecting a row dismisses the view. A missing `ctx.llm` notices `no LLM runtime is mounted`. Editing a provider's stored profile stays on `/login` and `settings.yaml`.

## Alternatives considered

**A writable Models page that edits `ctx.settings`.** Rejected for this slice: the Web page owns credential and profile forms. The TUI already writes subscription credentials through `/login`. A second editor would duplicate that store path before the roster exists.

**Reuse `/model`.** Rejected: `/model` lists live routes, not the configurable-provider directory. A dormant settings.yaml profile would stay invisible.

## Consequences

`/settings` lists Appearance, Models, Permission, and Inventory. Models is a roster; `/login` remains the TUI credential write.

## Testing

`tests/settings.spec.ts` pins the hub order and `modelsRows`. `tests/tui.spec.ts` under `pnpm run test:tui` notices a missing LLM runtime from the Models row and opens the picker over a stub `listConfigurableProviders()`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI login overlay](2026-08-14-tui-login-overlay.md) — the credential write this roster does not replace.
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md) — `/model` lists live routes, not this directory.
- [TUI session status chips](2026-08-14-tui-session-status-chips.md) — the other TUI chrome slice in this change.
