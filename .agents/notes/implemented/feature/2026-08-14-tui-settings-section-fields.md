# Agent Note: TUI settings section fields

Status: implemented

English | [中文](2026-08-14-tui-settings-section-fields.zh.md)

## Problem

The [Sections roster](2026-08-14-tui-settings-sections.md) named registered namespaces but not the keys those writes land in. A user could see that `tui-theme` exists and has a user layer, not which fields that section carries.

## Decision

`describe({ redactSecrets: true })` supplies the field list: top-level keys of the redacted `value`, plus one-segment entries in `secrets` so a secret slot still has a name. Confirming a namespace with fields opens a name-only picker; confirming a field notices `settings <ns>.<name>` and `overridden` when the redacted user layer names that key. A section with no field names keeps the namespace notice. Values are never shown. This panel does not call `mutate`.

## Alternatives considered

**Walk `schema.toJSON()` `{ uid, refs }` for property names.** Rejected: that encoding is not a flat property map, and walking it is the start of a schema-driven editor.

**Dump the resolved `value` into the notice.** Rejected: even a redacted value can carry non-secret configuration a notice should not print; names are enough.

**Call unredacted `describe()` and take `Object.keys` only.** Rejected: the descriptor would still hold secret values in the TUI process for no gain over `secrets`.

## Consequences

Sections can name the keys of a registered namespace. Secret field names appear; their values and user-layer mark do not, because redaction strips those keys from `user`. Writes stay on Models and the theme picker.

## Testing

`tests/settings.spec.ts` pins `settingsSectionFields` and `settingsSectionFieldRows`. `tests/tui.spec.ts` under `pnpm run test:tui` notices an overridden field from a stub `describe()` that includes `value` and `secrets`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI settings sections](2026-08-14-tui-settings-sections.md) — the namespace roster this picker sits on.
