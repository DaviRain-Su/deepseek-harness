# Agent Note: TUI settings Inventory panel

Status: implemented

English | [中文](2026-08-15-tui-inventory-panel.zh.md)

## Problem

The `/settings` hub's Phase 3 list (Appearance / Models / Plugins / Permission / Presets / Inventory) named an Inventory panel, but the earlier seam survey concluded no Cordis plugin-enumeration seam was reachable from the TUI and deferred it. That survey searched the Cordis core, not the vendored loader, and so missed the enumeration surface the TUI already runs on.

## Decision

The Inventory panel needs no new seam. The vendored `@deepseek-ai/cordis-plugin-loader` declares `ctx.loader: Loader` on `Context`, and `Loader.entries()` yields each mounted plugin `Entry` (`options.id`, `options.name` module specifier, and a `disabled` getter). The TUI reads the optional loader through `ctx.get('loader')`; a missing loader produces a notice and leaves the hub closed. A read-only `OverlayPicker` lists mounted entries — full path id as the value, module specifier as the label, a `disabled` marker when set — and Esc closes. The hub gains an `Inventory` row; selecting a row dismisses the view and changes nothing, since a configuration surface is a read-only listing here, not an enable/disable control.

`PluginInventoryEntry` (flat `id` / `name` / `disabled`) and `PluginInventorySource` (`entries(): Iterable<PluginInventoryEntry>`) are declared in `settings.ts` as structural interfaces, mirroring `PermissionPresetSource`. The mounted loader does not satisfy `PluginInventorySource` directly (`Entry` carries `options.name` and `options.disabled`, not flat fields), so `openInventoryPicker` adapts `Entry → PluginInventoryEntry` and hands the adapter to `inventoryRows`. The flat shape lets `settings.spec.ts` build rows from a plain source with no loader.

## Alternatives considered

**A read-only Models/Inventory overview over `ctx.llm`.** Rejected as the Inventory panel: `/model` already lists the live LLM routes through `listProviders` / `listModels` / `resolveModelInfo`, so an LLM overview duplicates it. Inventory enumerates the loader's mounted plugin tree, a different axis from the live model routes.

**A plugin-control service.** Rejected for this panel: enabling/disabling plugins is a real capability seam (Service Definition / Provider / Consumer) with no current consumer, larger than a read-only listing. The Inventory panel is the read-only half; control is the separate Plugins panel.

**A new enumeration service wrapping the loader.** Rejected: `ctx.get('loader')?.entries()` is already the enumeration surface and is in the TUI's reach, so a wrapper service would duplicate the loader with no current owner or need.

## Consequences

Inventory is feasible without a new seam; the earlier "no enumeration seam" conclusion (searching the Cordis core) was wrong and is corrected here. `/settings` now ships three panels — Appearance, Permission, Inventory. The real seam investments for the remaining panels are untouched: Presets needs `@deepseek-ai/dsh-agent-presets` mounted in the TUI profile (it registers an advisory `agent/created` listener that warns unless the TUI also composes sessions, so mounting is a composition behavior change, not just a panel), and Plugins needs a plugin-control capability seam. Models needs a schema-driven provider-settings forms editor over `LlmConfigurableProvider.settingsNs` sections.

## Testing

`tests/settings.spec.ts` pins `inventoryRows` (loader order, disabled marker vs omitted, empty list). `tests/tui.spec.ts` under `pnpm run test:tui` covers the missing-loader notice and provides a fake `loader` (`await: () => Promise.resolve()` so startup's `ctx.get('loader')?.await()` settles, plus `entries()`), submits `/settings`, navigates to the Inventory row, opens the picker, and escapes to close. The TUI has no keyless assembled snapshot harness; the package semantic matrix pins the panel, matching the settings-hub precedent.

## Related

- [TUI settings hub](2026-08-15-tui-settings-hub.md) — the hub this panel extends; documents the Appearance and Permission panels.
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md) — the `/model` picker, the sibling route Inventory does not duplicate.