# Agent Note: Subscription login for pi-ai OAuth providers

Status: implemented

English | [中文](2026-08-14-subscription-login.zh.md)

## Problem

An API key cannot authenticate a catalog provider whose only method is OAuth (`openai-codex`), and the six providers that ship OAuth beside a key have no product path that uses the subscription. The [directory-withholding note](../bug-fix/2026-08-13-oauth-only-providers-withheld.md) recorded the gap: no durable store, no login flow, no surface to run it from. Pasting a ChatGPT token into the key field expires with nothing to refresh it. Storing a token is also not enough for `/model`: `createModels({ credentials })` only helps after the catalog route is registered.

## Decision

`@deepseek-ai/dsh-llm-oauth` (`ctx.llmOAuth`) is a file-backed pi-ai `CredentialStore` at `$DSH_HOME/.auth.yaml` (mode `0600` under a `0700` parent). It owns `login` / `logout` / `loginableProviders` / `read` / `list` / `modify` / `delete`. Writes are atomic owner-only replaces under a cross-process lock. `llm/oauth-updated` names each provider whose stored credential changed. An explicit `path` is the document file, not a directory.

`dsh login` / `logout` / `auth` are launcher-owned. [`apps/cli/src/login.ts`](../../../../apps/cli/src/login.ts) boots a minimal tree (`llm-oauth` plus `@deepseek-ai/dsh-command-login`) so a profile argv parser cannot consume those tokens. Commander actions stay synchronous and only capture work; `apply` awaits the captured run after `parseCmdline` (`parse`, not `parseAsync`). Tokens land in the same `$DSH_HOME/.auth.yaml` the next profile boot reads.

The shipped base mounts `llm-oauth` before `llm-pi-ai`. When the store is already present at apply, the adapter `list()`s stored catalog ids, adds empty stubs (no `apiKeyEnv`) through `expandInstalledCatalog`, and hands the store to `createModels({ credentials })`. `llm/oauth-updated` busts the profile memo and re-runs registration and the directory. `ctx.inject(['llmOAuth'])` is late-mount only: a waiting inject on a tree that never mounts the store is the TUI settings race. Unknown / non-catalog ids are ignored. The directory still withholds an OAuth-only catalog route that has no stored credential; those stubs join through the profile half of the union.

Loginable catalog ids are whatever `loginableProviders()` returns from the installed pi-ai catalog — today that includes `openai-codex`, `anthropic`, `xai`, `github-copilot`, `kimi-coding`, `openrouter`, `openrouter-images`, and `radius`. Bare `openai` is API-key only.

## Alternatives considered

**Mount `@deepseek-ai/dsh-command-login` in the profile tree.** Rejected: the profile startup parser would race the same argv. The launcher boots a separate process; command-login is not a base-profile row.

**Wait on `inject(['llmOAuth'])` whenever the store is absent.** Rejected: that is the TUI settings race (`invariant service settled without becoming active`). Product composition mounts the store first, so apply already listed.

**Treat `path` as a directory and always append `.auth.yaml`.** Rejected: it turned `path: '/x/.auth.yaml'` into `/x/.auth.yaml/.auth.yaml`. `resolveSpec` matches credentials-local: an explicit `path` is the file.

**Read `~/.codex/auth.json` into the store.** Rejected for the same reason the withholding note recorded: it binds the harness to another tool's private file format for one provider.

**Offer OAuth-only catalog routes with no stored credential.** Rejected: every request would still fail `Provider is not configured` before it goes out. The directory filter stays; a stored token or a settings-named route is what registers.

**Web login UI and TUI `/login`.** Deferred. `dsh login` is the product path; a live TUI must restart to see a newly stored route.

## Consequences

`dsh login openai-codex` then a new `dsh` (or TUI restart) makes that catalog route selectable in `/model` and authenticates requests through the store, with refresh under the lock. The Models page still cannot start the flow, and Codex stays off **Add provider** until a token is stored or a settings document already names the route. A same-UID process can read `$DSH_HOME/.auth.yaml`; owner-only mode stops other OS users, not the model or tools running as the same user.

## Testing

`packages/llm/llm-oauth/tests` pin parse, owner-only mode, login/logout, `llm/oauth-updated`, and the watcher (chokidar mocked). `packages/llm/command-login/tests` pin `ownsInvocation`, the three commands, and the readline interaction (mocked). `apps/cli/tests/args.spec.ts` and `login.spec.ts` pin launcher routing and the minimal tree. `packages/llm/llm-pi-ai/tests/adapter.spec.ts` and `catalog.spec.ts` pin `oauthProviders` stubs, a live store, post-login re-registration, and late-mount inject. Login success is stubbed through `vi.mock('@earendil-works/pi-ai/providers/all')`. There is no keyless assembled snapshot of a completed OAuth flow.

## Related

- [The configurable-provider directory withholds OAuth-only providers](../bug-fix/2026-08-13-oauth-only-providers-withheld.md) — the directory filter this work leaves in place.
- [File-backed credentials](../../../../packages/credentials/credentials-local/README.md) — the document, lock, and watcher pattern the OAuth store follows.
