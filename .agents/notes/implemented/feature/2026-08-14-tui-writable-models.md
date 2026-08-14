# Agent Note: TUI writable Models credentials

Status: implemented

English | [中文](2026-08-14-tui-writable-models.zh.md)

## Problem

The [Models roster](2026-08-14-tui-settings-models-panel.md) listed configurable providers but could not store a key. Web writes through `ctx.credentials.set` and records `apiKeyEnv` via `ctx.settings.mutate`. TUI users had to leave the process for `settings.yaml` or `/login` (OAuth only).

## Decision

Selecting a Models row opens Set API key, Clear API key when `describe()` reports a writable stored value, and Login when `ctx.llmOAuth` lists that route. Set reuses `LoginTextForm`. A typed key stores under the profile's existing `apiKeyEnv`, or under `deriveKeyRef(provider)` after a `mutate` that records that reference. Clear calls `credentials.unset`. `/login` remains the subscription OAuth write. Missing `ctx.credentials` or `ctx.settings` notices. A successful write notices ` · restart` when `describe()` says that namespace applies after reload. Base URL and display name are later writes on the same picker ([TUI writable base URL](2026-08-14-tui-writable-base-url.md), [TUI writable display name](2026-08-14-tui-writable-display-name.md)); model lists stay off this path.

## Alternatives considered

**A full Web Models form (base URL, model list, protocol).** Rejected: those fields need the schema-driven editor. The TUI gap was storing a key.

**Write a literal `apiKey` into the settings section.** Rejected: configuration carries references, not secrets. Web already stores under `credentials` and names `apiKeyEnv`.

## Consequences

`/settings` → Models is a write path for API keys. The roster note's "read-only" decision is superseded for credentials only.

## Testing

`tests/settings.spec.ts` pins `deriveKeyRef`, `apiKeyRefusal`, `apiKeyEnvOf`, and `providerCredentialRows`. `tests/tui.spec.ts` under `pnpm run test:tui` stores a key through stub `settings.mutate` and `credentials.set`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI settings Models panel](2026-08-14-tui-settings-models-panel.md) — the roster this write path sits on.
- [TUI login overlay](2026-08-14-tui-login-overlay.md) — subscription OAuth, still the Login row.
- [TUI writable base URL](2026-08-14-tui-writable-base-url.md) — the endpoint write on the same picker.
- [TUI writable display name](2026-08-14-tui-writable-display-name.md) — the label write on the same picker.
- [TUI writable web search](2026-08-14-tui-writable-web-search.md) — the search-provider key and endpoint on the same hub.
