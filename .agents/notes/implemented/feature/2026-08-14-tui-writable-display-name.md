# Agent Note: TUI writable display name

Status: implemented

English | [中文](2026-08-14-tui-writable-display-name.zh.md)

## Problem

The [writable Models](2026-08-14-tui-writable-models.md) picker stored a key and [base URL](2026-08-14-tui-writable-base-url.md) but not `displayName`. A custom gateway label still required editing `settings.yaml`. The field is a plain string on the same nested profile `settings.mutate` already walks.

## Decision

Set display name appears when `settingsPath` is non-empty — a nested provider profile, which is where `llm-pi-ai` stores `displayName`. Clear display name appears when `displayNameOf` finds a stored value. Set reuses `LoginTextForm` (not secret). A blank draft refuses; `llm-pi-ai` rejects an empty `displayName`, and the TUI does not invent a format rule. Set writes `{ op: 'set', path: [...settingsPath, 'displayName'] }`; Clear writes `unset` so the route id wins again. A successful write notices ` · restart` when `describe()` says that namespace applies after reload. A section-root profile such as DeepSeek official has no `displayName` field, so those rows stay hidden. Model lists and `api` / protocol stay off this path.

## Alternatives considered

**Offer the rows on every configurable provider.** Rejected: `llm-deepseek` has no `displayName`; the mutate would fail on the default Models row.

**Walk `describe().schema` to decide whether the field exists.** Rejected: that is the start of a schema-driven editor.

## Consequences

`/settings` → Models can rename a nested provider without opening the YAML. The official DeepSeek row still has no label write.

## Testing

`tests/settings.spec.ts` pins `displayNameOf`, `displayNameRefusal`, and the extra picker rows. `tests/tui.spec.ts` under `pnpm run test:tui` sets and unsets through stub `settings.mutate`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable Models](2026-08-14-tui-writable-models.md) — the key write this picker already had.
- [TUI writable base URL](2026-08-14-tui-writable-base-url.md) — the endpoint write on the same picker.
