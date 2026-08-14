# Agent Note: TUI 登录 overlay

Status: implemented

[English](2026-08-14-tui-login-overlay.md) | 中文

## 问题

`dsh login` 由启动器拥有并退出。正在运行的 TUI 已经会在 `llm/adapters-updated` 上刷新 `/model`，但启动 OAuth 流程仍要离开会话。把 `@deepseek-ai/dsh-command-login` 挂进 tui 树会和 profile 的 argv 解析抢跑。再写一套 OAuth 客户端会和存储已经拥有的 `login` 分叉。

## 决策

TUI `/login`、`/logout` 和 `/auth` 直接调用 `ctx.llmOAuth`。`/login` 在行里没有提供方 id 时打开 `loginableProviders()` 的 OverlayPicker（标签为 `loginLabel ?? name`），然后用 TUI `AuthInteraction` 调用 `login(id, interaction)`：select 走 OverlayPicker，text / secret / manual_code 走自由文本表单（secret 显示星号；空提交拒绝 `A value is required`），`auth_url` / `device_code` 留在状态 overlay 上，`info` / `progress` 写入 transcript 提示。Escape、中止或隐藏 overlay 拒绝 `Login cancelled`。`/logout` 挑选已存储凭据。`/auth` 提示 `formatAuthStatus`。缺少 `llmOAuth` 时提示 `subscription login is not mounted`；runtime 不 `inject(['llmOAuth'])`（与 TUI settings 同一类挂起）。`@deepseek-ai/dsh-command-login` 不进入 tui patch。

成功登录与 `dsh login` 写入同一份存储，因此现有的 `llm/adapters-updated` 路径会重建 `/model`。

## 考虑过的替代方案

**在 tui-runtime 下挂载 `@deepseek-ai/dsh-command-login`。** 否决：[订阅登录笔记](2026-08-14-subscription-login.md) 已因 argv 抢跑否决过 profile 树挂载。

**`inject(['llmOAuth'])`。** 否决：等待型 inject 会让从未挂载该存储的树挂起，与 settings 同一类失败。

**在 `auth_url` 上自动打开浏览器。** 否决：CLI 打印 URL 并等待；overlay 做同样的事。

## 后果

交互式 `dsh` 可以在不离开 TTY 的情况下开始并完成订阅登录。CLI 路径仍是 `dsh login`。Web 仍没有登录界面。登录后 TUI 不会自动切换 `/model`。

## 测试

`packages/bundle/tui/tests/login.spec.ts` 用假 overlay 驱动交互：select、text、secret 掩码、空提交拒绝、escape / abort / hide、`auth_url` / `device_code` / info / progress，以及未知事件。`tui.spec.ts` 在 `pnpm run test:tui` 下启动 FakeTerminal 会话：缺少存储会提示、`/login` picker 然后 stub `login`、`/login <id>` 跳过 picker、`/auth` 提示状态、`/logout` 删除已存储 id。仍没有走完 OAuth 流程的无密钥组装 TUI 快照。

## 相关

- [pi-ai OAuth 提供方的订阅登录](2026-08-14-subscription-login.md) — 本 overlay 调用的存储与 CLI 路径。
- [TUI 活模型目录](2026-08-14-tui-live-model-catalog.md) — 存储写入后的 `/model` 刷新。
