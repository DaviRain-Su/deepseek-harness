# @deepseek-ai/dsh-command-login

English | [中文](README.zh.md)

Launcher-owned CLI for pi-ai subscription login. It registers `login [provider]`, `logout <provider>`, and `auth` through `@deepseek-ai/dsh-cmdline`, and only consumes an invocation whose first inner argument is one of those commands. The product path is `dsh login` / `dsh logout` / `dsh auth`: the CLI boots a minimal tree (this plugin plus [`@deepseek-ai/dsh-llm-oauth`](../llm-oauth/README.md)) so a profile startup parser cannot race the same argv. Tokens land in `$DSH_HOME/.auth.yaml`, which the next profile boot reads.

```text
dsh login [provider]
dsh logout <provider>
dsh auth
```

Omitting the provider on `login` prompts a select over the installed catalog providers that ship an OAuth flow. The terminal interaction prints the auth URL or device code and reads one line at a time.

This package is not a base-profile row. A composition that mounts it beside a full app no-ops unless the inner arguments start with `login`, `logout`, or `auth`.

## Model Experience

Indirectly, through the pi-ai adapter: these commands only persist or remove tokens, and the adapter owns every model-visible request those tokens authorize.

#### KV Cache effect

No direct invalidation; the commands never enter a request prefix.

## Known Limitations and Deferred Work

- **No in-process TUI `/login`** — the flow runs in the launcher's minimal tree and exits; a live TUI must restart to see a newly stored route.
- **Web has no counterpart** — the Models page still cannot start an OAuth flow.
