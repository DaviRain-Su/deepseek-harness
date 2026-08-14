# Agent Note: TUI 可写 Models 凭据

Status: implemented

[English](2026-08-14-tui-writable-models.md) | 中文

## 问题

[Models 名册](2026-08-14-tui-settings-models-panel.md)列出了可配置提供方，但不能存密钥。Web 经 `ctx.credentials.set` 写入，并用 `ctx.settings.mutate` 记录 `apiKeyEnv`。TUI 用户只能离开进程去改 `settings.yaml`，或走仅限 OAuth 的 `/login`。

## 决策

选中 Models 一行后打开 Set API key；当 `describe()` 报告存在可写已存值时出现 Clear API key；当 `ctx.llmOAuth` 列出该路由时出现 Login。Set 复用 `LoginTextForm`。键入的密钥存到 profile 已有的 `apiKeyEnv` 下；若没有，则先 `mutate` 记下 `deriveKeyRef(provider)` 再写入。Clear 调用 `credentials.unset`。订阅 OAuth 仍走 `/login`。缺少 `ctx.credentials` 或 `ctx.settings` 时提示。写入成功时，若 `describe()` 标明该命名空间要重启才生效，提示会加上 ` · restart`。Base URL 和 display name 是同一 picker 上的后续写入（[TUI 可写 base URL](2026-08-14-tui-writable-base-url.md)、[TUI 可写 display name](2026-08-14-tui-writable-display-name.md)）；模型列表仍不走这条路径。

## 考虑过的替代方案

**完整的 Web Models 表单（base URL、模型列表、协议）。** 否决：那些字段需要按 schema 驱动的编辑器。TUI 缺口是存密钥。

**把字面 `apiKey` 写入 settings 分节。** 否决：配置只携带引用，不携带机密。Web 已经存到 `credentials` 并点名 `apiKeyEnv`。

## 后果

`/settings` → Models 是 API key 的写入路径。名册笔记里「只读」的决策仅在凭据这一点上被取代。

## 测试

`tests/settings.spec.ts` 固定 `deriveKeyRef`、`apiKeyRefusal`、`apiKeyEnvOf` 和 `providerCredentialRows`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下经桩 `settings.mutate` 与 `credentials.set` 存入密钥。仍然没有无密钥的组装 TUI 快照。

## 相关

- [TUI settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 本写入路径所在的名册。
- [TUI 登录 overlay](2026-08-14-tui-login-overlay.md) — 订阅 OAuth，仍是 Login 行。
- [TUI 可写 base URL](2026-08-14-tui-writable-base-url.md) — 同一 picker 上的端点写入。
- [TUI 可写 display name](2026-08-14-tui-writable-display-name.md) — 同一 picker 上的标签写入。
- [TUI 可写 web search](2026-08-14-tui-writable-web-search.md) — 同一 hub 上的搜索提供方密钥和端点。
