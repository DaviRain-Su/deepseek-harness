# Agent Note: TUI 活模型目录

Status: implemented

[English](2026-08-14-tui-live-model-catalog.md) | 中文

## 问题

`dsh login` 在另一进程写入 `$DSH_HOME/.auth.yaml`。正在运行的 TUI 已经挂了存储监视器，`llm-pi-ai` 也会在 `llm/oauth-updated` 上重新注册，但 `/model` 只在打开 picker 时读 `ctx.llm`。已打开的 picker 会过期，也没有提示告诉用户路由已经出现，所以[订阅登录笔记](2026-08-14-subscription-login.md)把重启 TUI 当成必要步骤。

## 决策

TUI 监听 `llm/adapters-updated`——路由注册或卸载之后的无载荷拓扑提交——而不是 `llm/oauth-updated`。该事件在 `refreshOauthRoutes` 跑完 `ensureRegistrationFacts()` 之后发出，因此 picker 重读的是已提交的目录，而不会和适配器的 `list().then` 抢跑。TTY 启动后，runtime 先快照当前提供方 id。之后的提交会用 `listProviders()` × `listModels()` 重建打开的 `/model` picker。picker 关闭时，新注册的 id 提示为 `<id> available — /model`；若当前选择的提供方离开目录，提示为 `<id> is no longer available`。由 settings 驱动的路由替换走同一条路径。

目录刷新与 TUI `/login` 独立；该 overlay 见 [TUI 登录 overlay](2026-08-14-tui-login-overlay.md)。CLI 路径仍是 `dsh login`。

## 考虑过的替代方案

**监听 `llm/oauth-updated`。** 否决：该 emit 与适配器的异步 `list()` 刷新并行；同一拍重建 picker 仍可能看到上一份注册。

**轮询 `listProviders()`。** 否决：`llm/adapters-updated` 就是文档里的重读信号。

**自动把会话切到新存储的路由。** 否决：`/model` 仍是显式选择。

## 后果

另一进程里的 `dsh login` 在存储监视器提交后会出现在正在运行的 TUI `/model`。已经打开的 picker 会替换行。登出当前提供方会提示；页脚保留上次选择，直到用户另选路由。

## 测试

`packages/bundle/tui/tests/tui.spec.ts` 在 `pnpm run test:tui` 下对可变的假 `ctx.llm` 发出 `llm/adapters-updated`：打开的 picker 出现新提供方行；关闭的 picker 提示 `available — /model`；去掉当前选择的提供方则提示 `is no longer available`。仍没有无密钥的组装 TUI 快照。

## 相关

- [pi-ai OAuth 提供方的订阅登录](2026-08-14-subscription-login.md) — 本 UI 观察的存储监视器与适配器刷新。
- [TUI `/model` 档位 picker](2026-08-15-tui-model-effort-picker.md) — 这次重建会重新挂上的 picker。
- [TUI 登录 overlay](2026-08-14-tui-login-overlay.md) — 进程内写入存储，发出同一次拓扑提交。
