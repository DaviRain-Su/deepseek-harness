# Agent Note: TUI settings file path

Status: implemented

English | [中文](2026-08-14-tui-settings-file-path.zh.md)

## Problem

Web can open the user-editable settings document. The TUI `/settings` hub wrote keys and switched presets but never named `ctx.settings.documentPath`, so a user could not see which file those writes land in.

## Decision

When `ctx.settings.documentPath` is set, `/settings` appends a Settings file row. Its description is the `~/…` form of that path. Confirming the row notices the absolute path. A missing path or a non-file provider omits the row. The TUI does not spawn an editor and does not call `prepareDocument()`.

## Alternatives considered

**Open the file in `$EDITOR`.** Rejected: that suspends or races the TUI process; noticing the path is enough to open it elsewhere.

**A General panel that edits plugin config.** Rejected: that needs the schema-driven editor. The gap was naming the file.

**Always show the row and notice `no local settings file`.** Rejected: the service treats a missing path as no open-document affordance.

## Consequences

The hub names the local settings file when one exists. Models still does not edit the YAML by hand.

## Testing

`tests/settings.spec.ts` pins the extra row and the `~/…` description. `tests/tui.spec.ts` under `pnpm run test:tui` notices the absolute path from a stub `documentPath`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI settings Models panel](2026-08-14-tui-settings-models-panel.md) — the hub this row joins.
- [TUI writable Models](2026-08-14-tui-writable-models.md) — credential writes that land in this file's references.
- [TUI settings sections](2026-08-14-tui-settings-sections.md) — the other settings-hub roster.
