# Agent Note: TUI /settings Models 面板

Status: implemented

[English](2026-08-14-tui-settings-models-panel.md) | 中文

## 问题

Web 的 Models 页列出可配置的 LLM 提供方。TUI 已有 `/login`、`/logout`、`/auth` 和 `/model`，但 `/settings` 没有提供方名册，用户看不到 `settings.yaml` 能配置哪些路由，除非离开进程。

## 决策

`/settings` 在外观和权限之间增加 Models 行。确认后打开只读 picker，列出 `ctx.llm.listConfigurableProviders()`。选中一行即关闭。缺少 `ctx.llm` 时提示 `no LLM runtime is mounted`。改提供方的已存 profile 仍走 `/login` 和 `settings.yaml`。

## 考虑过的替代方案

**可写的 Models 页，直接改 `ctx.settings`。** 本切片否决：凭证和 profile 表单归 Web。TUI 已通过 `/login` 写订阅凭证。名册还没出现之前再做第二套编辑器会重复那条存储路径。

**复用 `/model`。** 否决：`/model` 列的是活路由，不是可配置提供方目录。休眠的 settings.yaml profile 仍然看不见。

## 后果

`/settings` 列出外观、Models、权限和 Inventory。Models 是名册；TUI 写凭证仍走 `/login`。

## 测试

`tests/settings.spec.ts` 钉住 hub 顺序和 `modelsRows`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下从 Models 行提示缺失的 LLM runtime，并打开 stub `listConfigurableProviders()` 的 picker。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 登录 overlay](2026-08-14-tui-login-overlay.md) — 本名册不替代的凭证写入。
- [TUI 活模型目录](2026-08-14-tui-live-model-catalog.md) — `/model` 列活路由，不是本目录。
- [TUI 会话状态 chip](2026-08-14-tui-session-status-chips.md) — 同一次改动里的另一块 TUI chrome。
