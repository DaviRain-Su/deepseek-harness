# Agent Note: TUI settings hub

Status: implemented

English | [中文](2026-08-15-tui-settings-hub.zh.md)

## Problem

The TUI exposed `/model` and `/theme` as separate slash commands with no shared entry point. The base profile mounts `ctx.permissionPresets`, but the terminal had no in-process surface for switching the sandbox mode + approval policy bundle; the only preset surface was the TEXT `/permission` command.

## Decision

A `/settings` command opens an `OverlayPicker` hub whose rows are sub-panels. 3a ships Appearance and Permission. Appearance reuses `/theme` (`openThemePicker`) rather than a second store. Permission is an `OverlayPicker` over `PermissionPresetService`: rows are `optionOf(name)` in declaration order, the current preset (`source.current(session.events)`) is preselected, and a `custom` row appears only when the effective knobs match no preset. Confirming a table entry calls `source.set(session, name)` (records a `permission/preset` event and writes the sandbox/approval knobs) and notices `permission <name>`; the `custom` row is a no-op, since `custom` is derived, not settable; Escape or an external hide settles with no write. The hub hides itself before opening a sub-panel so only one overlay is focused.

`PermissionPresetSource` is declared locally in `settings.ts` as a structural interface; the mounted `PermissionPresetService` satisfies it, so the pure row builders and the picker test without the service class. The TUI package adds `@deepseek-ai/dsh-permission-presets` as a peer and dev dependency and a project `reference` in `tsconfig.json`. Without the reference, the source-plane typecheck pulls `permission-presets` src, which type-imports `dsh-shell` → `dsh-subprocess` src, outside the TUI `rootDir`.

## Alternatives considered

**A second settings store for appearance.** Rejected: `tui-theme` already owns the palette id through `ctx.settings`; a second store would duplicate the persistence path. `/settings` routes Appearance to `/theme`.

**A real `custom` switch.** Rejected: `CUSTOM_PRESET` names the derived state where the session's knobs match no table entry; it has no spec to write. The row is shown for orientation only.

**An allow-always grant store on the Permission panel.** Rejected: the one-shot approval overlay (`Allow once` / `Reject`) already covers per-call escalation; an allow-always grant store is a separate decision and not part of this panel.

## Consequences

`/settings` is the single entry point for session settings; later panels (Models, Plugins, Inventory) add hub rows. The Permission panel is the first in-process surface for `ctx.permissionPresets` beyond the TEXT `/permission` command. Switching a preset mid-turn writes the knobs for the current session and records a `permission/preset` event, so the log reconstructs the effective mode.

## Testing

`tests/settings.spec.ts` pins `settingsHubRows`, `permissionPresetRows` (declaration order, description omission, custom-row append), and `promptPermissionPreset` (confirm writes + hides, custom no-write, escape cancel, external hide). `tests/tui.spec.ts` under `pnpm run test:tui` submits `/settings`, asserts `/help` lists it and the hub opens, confirms Appearance to open the theme picker, and escapes to close. The TUI still has no keyless assembled snapshot harness; the package semantic matrix pins the hub.

## Related

- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the command plane this extends.
- [TUI approval overlay](2026-08-14-tui-approval-overlay.md) — the one-shot Allow once / Reject overlay this panel complements.
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md) — the `/model` picker, a sibling sub-panel.