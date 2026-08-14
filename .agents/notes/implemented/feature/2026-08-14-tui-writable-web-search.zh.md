# Agent Note: TUI 可写 web search

Status: implemented

[English](2026-08-14-tui-writable-web-search.md) | 中文

## 问题

Web 的 Plugins 卡片经 `ctx.credentials` 写入 DeepSeek 搜索密钥，经 `ctx.settings.mutate` 写入 `web-search-deepseek` 上的搜索 `baseURL`。TUI `/settings` 已经用同样方式写 LLM 密钥，但搜索专用端点仍要手改 `settings.yaml`。搜索不复用 `$DEEPSEEK_BASE_URL`。

## 决策

当 `describe()` 列出 `web-search-deepseek` 时，`/settings` 在 Models 之后插入 Web search 一行。选中后打开 Set / Clear API key 和 Set / Clear base URL。密钥存到该分节的 `apiKeyEnv`，否则存 `DEEPSEEK_API_KEY`——绝不派生 `WEB_SEARCH_DEEPSEEK_API_KEY`。Clear 调用 `credentials.unset`。base URL 复用 Models 在分节根上的字符串写入。`maxUses`、模型和协议仍不走这条路径。缺少该命名空间时省略这一行，以免打乱已有 hub 导航。

## 考虑过的替代方案

**按 schema 驱动的 Plugins 编辑器（bash 超时、agent-loop 上限、maxUses）。** 否决：那些字段就是 TUI 已经拒绝的编辑器的起点。一个凭据加一个字符串，和 Models 写入一致。

**复用 Models 的 DeepSeek 行。** 否决：对话和搜索用不同端点；从 Models 写入共享密钥并不会设置 `DEEPSEEK_SEARCH_BASE_URL`。

## 后果

`/settings` → Web search 可以存搜索密钥并覆盖搜索端点，而不打开 YAML。默认密钥和官方 DeepSeek 对话用的是同一引用。

## 测试

`tests/settings.spec.ts` 钉住 hub 行和 `webSearchKeyRef`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `describe()` 列出该命名空间时打开该行，并经桩 `credentials` 与 `settings.mutate` 存密钥和 `baseURL`。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 可写 Models](2026-08-14-tui-writable-models.md) — 本路径所抄的 LLM 密钥写入。
- [TUI 可写 base URL](2026-08-14-tui-writable-base-url.md) — 搜索端点复用的字符串 mutate。
- [TUI settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 本行所在的 hub。
- [TUI 可写 shell timeout](2026-08-14-tui-writable-shell-timeout.md) — 同一 hub 上的单字段数字写入。
