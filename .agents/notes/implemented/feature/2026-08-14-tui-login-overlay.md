# Agent Note: TUI login overlay

Status: implemented

English | [中文](2026-08-14-tui-login-overlay.zh.md)

## Problem

`dsh login` is launcher-owned and exits. A live TUI already refreshes `/model` on `llm/adapters-updated`, but starting the OAuth flow still required leaving the session. Mounting `@deepseek-ai/dsh-command-login` in the tui tree would race the profile argv parser. A second OAuth client would diverge from the store `login` already owns.

## Decision

TUI `/login`, `/logout`, and `/auth` call `ctx.llmOAuth` directly. `/login` opens an OverlayPicker of `loginableProviders()` (label `loginLabel ?? name`) unless the line already names a provider, then `login(id, interaction)` with a TUI `AuthInteraction`: select is OverlayPicker, text / secret / manual_code is a free-text form (secret paints asterisks; empty submit rejects `A value is required`), `auth_url` / `device_code` stay on a status overlay, and `info` / `progress` notice the transcript. Escape, abort, or hiding the overlay rejects `Login cancelled`. `/logout` picks a stored credential. `/auth` notices `formatAuthStatus`. Missing `llmOAuth` notices `subscription login is not mounted`; the runtime does not `inject(['llmOAuth'])` (the TUI settings race). `@deepseek-ai/dsh-command-login` stays off the tui patch.

A successful login is the same store write as `dsh login`, so the existing `llm/adapters-updated` path rebuilds `/model`.

## Alternatives considered

**Mount `@deepseek-ai/dsh-command-login` under tui-runtime.** Rejected: the [subscription-login note](2026-08-14-subscription-login.md) already rejected a profile-tree mount for the argv race.

**`inject(['llmOAuth'])`.** Rejected: a waiting inject hangs a tree that never mounts the store, the same failure as settings.

**Auto-open the browser on `auth_url`.** Rejected: the CLI prints the URL and waits; the overlay does the same.

## Consequences

Interactive `dsh` can start and finish a subscription login without leaving the TTY. `dsh login` remains the CLI path. Web still has no login UI. The TUI does not auto-switch `/model` after login.

## Testing

`packages/bundle/tui/tests/login.spec.ts` drives the interaction through a fake overlay: select, text, secret mask, empty reject, escape / abort / hide, `auth_url` / `device_code` / info / progress, and unknown events. `tui.spec.ts` under `pnpm run test:tui` boots a FakeTerminal session: missing store notices, `/login` picker then stub `login`, `/login <id>` skips the picker, `/auth` notices status, `/logout` deletes a stored id. There is still no keyless assembled TUI snapshot of a completed OAuth flow.

## Related

- [Subscription login for pi-ai OAuth providers](2026-08-14-subscription-login.md) — the store and CLI path this overlay calls.
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md) — `/model` refresh after the store write.
