# Agent Note: TUI settings sections

Status: implemented

English | [中文](2026-08-14-tui-settings-sections.zh.md)

## Problem

Web's settings UI lists every registered namespace from `ctx.settings.describe()`. The TUI hub had Inventory (loader entries) and Settings file (the document path) but not the namespaces those writes land in, so a user could not see which sections exist or which have a user layer.

## Decision

When `ctx.settings.describe` is a function, `/settings` appends a Sections row after Inventory. Confirming it opens a read-only picker over `describe({ redactSecrets: true })`: label is the namespace, description is `applies` plus `overridden` when `user` is present. Confirming a row with field names opens a name-only picker ([TUI settings section fields](2026-08-14-tui-settings-section-fields.md)); otherwise it notices `settings <ns> · <applies>` and `overridden` when a user layer exists. An empty describe notices `no settings sections`. This panel does not call `mutate`.

## Alternatives considered

**A schema-driven editor for each namespace.** Rejected: that is the Web plugin-config form. The gap was naming the registered sections.

**Dump the resolved `value` into the notice.** Rejected: same-process `describe()` is unredacted; a notice must not print secrets.

**Always show the hub row and notice `settings are not mounted`.** Rejected: a missing `describe` is no roster, matching Settings file omitting a missing path.

## Consequences

The hub names registered settings namespaces. Models and Settings file stay the write and path rows. Field values and schema-driven edits stay off this path.

## Testing

`tests/settings.spec.ts` pins the hub row and `settingsSectionRows`. `tests/tui.spec.ts` under `pnpm run test:tui` notices an overridden section from a stub `describe()` and `no settings sections` when the list is empty. There is still no keyless assembled TUI snapshot.

## Related

- [TUI settings Models panel](2026-08-14-tui-settings-models-panel.md) — the hub this row joins.
- [TUI settings file path](2026-08-14-tui-settings-file-path.md) — the document-path row on the same hub.
- [TUI settings section fields](2026-08-14-tui-settings-section-fields.md) — the name-only field picker on a confirmed row.
