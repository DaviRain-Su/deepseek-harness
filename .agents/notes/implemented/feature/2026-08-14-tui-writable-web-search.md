# Agent Note: TUI writable web search

Status: implemented

English | [中文](2026-08-14-tui-writable-web-search.zh.md)

## Problem

Web's Plugins card writes the DeepSeek search key through `ctx.credentials` and the search `baseURL` through `ctx.settings.mutate` on `web-search-deepseek`. TUI `/settings` already writes LLM keys the same way, but a search-specific endpoint still required editing `settings.yaml`. Search does not reuse `$DEEPSEEK_BASE_URL`.

## Decision

When `describe()` lists `web-search-deepseek`, `/settings` inserts a Web search row after Models. Confirming it opens Set / Clear API key and Set / Clear base URL. The key stores under the section's `apiKeyEnv`, or `DEEPSEEK_API_KEY` — never a derived `WEB_SEARCH_DEEPSEEK_API_KEY`. Clear calls `credentials.unset`. Base URL reuses the Models string write on the section root. `maxUses`, model, and protocol stay off this path. A missing namespace omits the row so existing hub navigation does not shift.

## Alternatives considered

**A schema-driven Plugins editor (bash timeout, agent-loop cap, maxUses).** Rejected: those fields are the start of the editor this TUI has already declined. One credential and one string match the Models write.

**Reuse the Models DeepSeek row.** Rejected: chat and search use different endpoints; writing the shared key from Models does not set `DEEPSEEK_SEARCH_BASE_URL`.

## Consequences

`/settings` → Web search can store a search key and override the search endpoint without opening the YAML. The default key is the same reference official DeepSeek chat uses.

## Testing

`tests/settings.spec.ts` pins the hub row and `webSearchKeyRef`. `tests/tui.spec.ts` under `pnpm run test:tui` opens the row when `describe()` lists the namespace and stores a key plus `baseURL` through stub `credentials` and `settings.mutate`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable Models](2026-08-14-tui-writable-models.md) — the LLM key write this path copies.
- [TUI writable base URL](2026-08-14-tui-writable-base-url.md) — the string mutate reused for the search endpoint.
- [TUI settings Models panel](2026-08-14-tui-settings-models-panel.md) — the hub this row sits on.
- [TUI writable shell timeout](2026-08-14-tui-writable-shell-timeout.md) — the one-field number write on the same hub.
