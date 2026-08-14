# Agent Note: TUI /settings Models panel

Status: implemented

English | [中文](2026-08-14-tui-settings-models-panel.zh.md)

## Problem

Web's Models page lists configurable LLM providers. The TUI already has `/login`, `/logout`, `/auth`, and `/model`, but `/settings` had no provider roster, so a user could not see which routes settings.yaml can configure without leaving the process.

## Decision

`/settings` adds a Models row between Appearance and Permission. Confirming it opens a picker over `ctx.llm.listConfigurableProviders()`. Each row's description is the settings namespace, the credential `source` (`file` / `env` / …) or `key` when `credentials.describe` reports a configured reference, and the profile `baseURL` when one is set — never the secret. A missing `ctx.llm` notices `no LLM runtime is mounted`. Storing an API key is the [writable Models](2026-08-14-tui-writable-models.md) slice.

## Alternatives considered

**A writable Models page that edits `ctx.settings`.** Deferred in this slice so the roster existed first; shipped afterwards in [writable Models](2026-08-14-tui-writable-models.md).

**Reuse `/model`.** Rejected: `/model` lists live routes, not the configurable-provider directory. A dormant settings.yaml profile would stay invisible.

## Consequences

`/settings` lists Appearance, Models, Web search when `describe()` lists `web-search-deepseek` ([TUI writable web search](2026-08-14-tui-writable-web-search.md)), Permission, Agent preset when `ctx.agentPresets` is mounted ([TUI agent presets](2026-08-14-tui-agent-presets.md)), Inventory, Sections when `describe` is available ([TUI settings sections](2026-08-14-tui-settings-sections.md)), and Settings file when `documentPath` is set ([TUI settings file path](2026-08-14-tui-settings-file-path.md)). Models is the roster; credential writes live on the later note.

## Testing

`tests/settings.spec.ts` pins the hub order, `modelsRows`, and `modelsRowDescription`. `tests/tui.spec.ts` under `pnpm run test:tui` notices a missing LLM runtime from the Models row and opens the picker over stub `listConfigurableProviders()`, `settings.get`, and `credentials.describe`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable Models](2026-08-14-tui-writable-models.md) — storing an API key from a roster row.
- [TUI login overlay](2026-08-14-tui-login-overlay.md) — subscription OAuth, still the Login row.
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md) — `/model` lists live routes, not this directory.
- [TUI session status chips](2026-08-14-tui-session-status-chips.md) — the other TUI chrome slice in this change.
- [TUI settings file path](2026-08-14-tui-settings-file-path.md) — the hub row that names the local document.
- [TUI settings sections](2026-08-14-tui-settings-sections.md) — the read-only `describe()` roster.
