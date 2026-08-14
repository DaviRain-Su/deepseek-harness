# Agent Note: TUI /settings Models 面板

Status: implemented

[English](2026-08-14-tui-settings-models-panel.md) | 中文

## 问题

Web 的 Models 页列出可配置的 LLM 提供方。TUI 已有 `/login`、`/logout`、`/auth` 和 `/model`，但 `/settings` 没有提供方名册，用户看不到 `settings.yaml` 能配置哪些路由，除非离开进程。

## 决策

`/settings` 在外观和权限之间增加 Models 行。确认后打开 picker，列出 `ctx.llm.listConfigurableProviders()`。每行描述是 settings 命名空间、`credentials.describe` 报告已配置引用时的 `key`，以及 profile 已设的 `baseURL`——从不包含密钥本身。缺少 `ctx.llm` 时提示 `no LLM runtime is mounted`。存 API key 是[可写 Models](2026-08-14-tui-writable-models.md)切片。

## 考虑过的替代方案

**可写的 Models 页，直接改 `ctx.settings`。** 本切片先做出名册，随后在[可写 Models](2026-08-14-tui-writable-models.md)交付。

**复用 `/model`。** 否决：`/model` 列的是活路由，不是可配置提供方目录。休眠的 settings.yaml profile 仍然看不见。

## 后果

`/settings` 列出外观、Models、权限、Inventory，`describe` 可用时的 Sections（[TUI settings 分节](2026-08-14-tui-settings-sections.md)），以及 `documentPath` 存在时的 Settings file（[TUI settings 文件路径](2026-08-14-tui-settings-file-path.md)）。Models 是名册；凭据写入见后续笔记。

## 测试

`tests/settings.spec.ts` 钉住 hub 顺序、`modelsRows` 和 `modelsRowDescription`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下从 Models 行提示缺失的 LLM runtime，并打开 stub `listConfigurableProviders()`、`settings.get` 与 `credentials.describe` 的 picker。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 可写 Models](2026-08-14-tui-writable-models.md) — 从名册行存 API key。
- [TUI 登录 overlay](2026-08-14-tui-login-overlay.md) — 订阅 OAuth，仍是 Login 行。
- [TUI 活模型目录](2026-08-14-tui-live-model-catalog.md) — `/model` 列活路由，不是本目录。
- [TUI 会话状态 chip](2026-08-14-tui-session-status-chips.md) — 同一次改动里的另一块 TUI chrome。
- [TUI settings 文件路径](2026-08-14-tui-settings-file-path.md) — 说出本地文档的 hub 行。
- [TUI settings 分节](2026-08-14-tui-settings-sections.md) — 只读的 `describe()` 名册。
