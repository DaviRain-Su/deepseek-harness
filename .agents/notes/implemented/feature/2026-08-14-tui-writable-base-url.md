# Agent Note: TUI writable base URL

Status: implemented

English | [中文](2026-08-14-tui-writable-base-url.zh.md)

## Problem

The [writable Models](2026-08-14-tui-writable-models.md) picker stored an API key but not `baseURL`. A proxy or custom gateway still required editing `settings.yaml` by hand. The field is a plain string on the same profile `settings.mutate` already walks for `apiKeyEnv`.

## Decision

The per-provider picker always offers Set base URL. Clear base URL appears when `baseUrlOf` finds a stored value. Set reuses `LoginTextForm` (not secret). A blank draft refuses; the settings schema is a plain string, so the TUI does not invent a URL-format rule. Set writes `{ op: 'set', path: [...settingsPath, 'baseURL'] }`; Clear writes `unset` on that path so the catalog endpoint wins again. Model lists and `api` / protocol stay off this path.

## Alternatives considered

**A schema-driven Models form (model list, protocol, compat).** Rejected: those fields are arrays and closed unions. One string field is the same write the key path already uses.

**Require `http:` / `https:`.** Rejected: `PiAiProviderProfile.baseURL` is `z.string()` with no format.

## Consequences

`/settings` → Models can override a provider endpoint without opening the YAML. Settings file still only notices the path.

## Testing

`tests/settings.spec.ts` pins `baseUrlOf`, `baseUrlRefusal`, and the extra picker rows. `tests/tui.spec.ts` under `pnpm run test:tui` sets and unsets through stub `settings.mutate`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable Models](2026-08-14-tui-writable-models.md) — the key write this picker already had.
- [TUI settings file path](2026-08-14-tui-settings-file-path.md) — the hub row that names the file.
