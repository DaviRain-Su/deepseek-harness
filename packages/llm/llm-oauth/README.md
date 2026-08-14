# @deepseek-ai/dsh-llm-oauth

English | [中文](README.zh.md)

Durable subscription-login store (`ctx.llmOAuth`) for pi-ai OAuth providers. The document is `$DSH_HOME/.auth.yaml` (0600 under a 0700 parent). The store implements pi-ai's `CredentialStore`, so `@deepseek-ai/dsh-llm-pi-ai` can hand the same instance to `createModels({ credentials })` and let pi-ai refresh expired tokens under the store lock. Login and logout are app-owned: this package runs a catalog provider's OAuth flow and persists the returned credential; it does not mount a command surface.

```yaml
- id: llm-oauth
  name: '@deepseek-ai/dsh-llm-oauth'
```

`dsh login` / `logout` / `auth` boot a minimal tree that mounts this store plus [`@deepseek-ai/dsh-command-login`](../command-login/README.md). A profile that mounts the store (the shipped base does, before `llm-pi-ai`) reads the same file on the next boot.

## Config

| Field | Default | Meaning |
|---|---|---|
| `path` | `<harness home>/.auth.yaml` | Token document location. |
| `dshHome` | `$DSH_HOME` or `~/.dsh` | Harness home used when `path` is omitted. |
| `watch` | `true` | Hot-publish external edits. |
| `debounceMs` | `100` | Watcher write-settle window. |

The document is a YAML mapping of provider id to an `oauth`-tagged credential. Anything else fails loud at boot and warn-and-keep-the-last-good-snapshot on a live reload. Writes are atomic owner-only replaces under a cross-process lock. `llm/oauth-updated` names each provider whose stored credential changed.

## Model Experience

Indirectly, through the pi-ai adapter: a stored token authorizes that catalog route's provider requests, and the adapter owns every model-visible surface.

#### KV Cache effect

No direct invalidation; tokens never enter a request prefix.

## Known Limitations and Deferred Work

- **Web has no login UI** — `dsh login` and TUI `/login` write this store; the Models page still cannot start an OAuth flow.
- **A same-UID process can read the document** — owner-only mode stops other OS users, not the model or tools running as the same user.
