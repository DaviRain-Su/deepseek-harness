# Agent Note: TUI live model catalog

Status: implemented

English | [中文](2026-08-14-tui-live-model-catalog.zh.md)

## Problem

`dsh login` writes `$DSH_HOME/.auth.yaml` in a separate process. The live TUI already mounts the store watcher and `llm-pi-ai` already re-registers on `llm/oauth-updated`, but `/model` only read `ctx.llm` when the picker opened. An open picker stayed stale, and nothing told the user a route had appeared, so the [subscription-login note](2026-08-14-subscription-login.md) treated a TUI restart as required.

## Decision

The TUI listens to `llm/adapters-updated` — the payload-free topology commit after routes register or dispose — not `llm/oauth-updated`. That event fires after `refreshOauthRoutes` finishes `ensureRegistrationFacts()`, so the picker re-reads a committed catalog instead of racing the adapter's `list().then`. After the TTY starts, the runtime snapshots current provider ids. A later commit rebuilds an open `/model` picker from `listProviders()` × `listModels()`. When the picker is closed, newly registered ids notice as `<id> available — /model`; if the current selection's provider left the catalog, the notice is `<id> is no longer available`. Settings-driven route swaps use the same path.

Catalog refresh is independent of TUI `/login`; that overlay is [TUI login overlay](2026-08-14-tui-login-overlay.md). `dsh login` remains the CLI path.

## Alternatives considered

**Listen to `llm/oauth-updated`.** Rejected because that emit runs in parallel with the adapter's async `list()` refresh; a picker rebuild on the same tick can still see the previous registration.

**Poll `listProviders()`.** Rejected because `llm/adapters-updated` is the documented re-read signal.

**Auto-switch the session onto a newly stored route.** Rejected: `/model` stays an explicit selection.

## Consequences

A `dsh login` in another process appears in a live TUI `/model` after the store watcher commits. An already-open picker replaces its rows. Logout of the current provider notices; the footer keeps the last selection until the user picks another route.

## Testing

`packages/bundle/tui/tests/tui.spec.ts` under `pnpm run test:tui` emits `llm/adapters-updated` against a mutable fake `ctx.llm`: an open picker gains the new provider row; a closed picker notices `available — /model`; removing the current selection's provider notices `is no longer available`. There is still no keyless assembled TUI snapshot.

## Related

- [Subscription login for pi-ai OAuth providers](2026-08-14-subscription-login.md) — the store watcher and adapter refresh this UI observes.
- [TUI `/model` effort picker](2026-08-15-tui-model-effort-picker.md) — the picker this rebuild remounts.
- [TUI login overlay](2026-08-14-tui-login-overlay.md) — in-process store write that emits the same topology commit.
