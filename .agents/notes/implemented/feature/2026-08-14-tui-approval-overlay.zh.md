# Agent Note: TUI 审批 overlay

Status: implemented

[English](2026-08-14-tui-approval-overlay.md) | 中文

## 问题

随附 TUI 通过 base 挂载了 `dsh-user-approval`（`workspace-write` + `ask`），但没有注册 `approval/request` 应答者。因此 bash 升级和 `tools/pre-execute` 的 `ask` 会落到 `unavailable`，工具调用被拒绝。Web 已经用 mux 帧应答；TUI README 把缺失的 overlay 标成终端还不能当日常默认入口的缺口。

## 决策

`tui-runtime` 在 TTY 启动后注册一个终端应答者。监听器仅在 `req.agent` 是本会话 agent 时应答，否则调用 `next()`。overlay 复用 `OverlayPicker`：标题 `Allow <toolName>?`，选项 `Allow once` / `Reject`（与 ACP 广告的一次性配对相同），提示为询问方的 `reason` 或「仅本次调用」回退文案。第一行回车是 `allowed-once`；第二行是 `rejected`；Escape、中止信号、隐藏 overlay 或退出都结算为 `cancelled`。已经中止的信号不会打开 overlay。

runtime 注入 `approval`，没有该 seam 的树无法激活。不增加 `allow-always`、授权存储或 `/permission` 命令；会话策略仍通过 `dsh-permission-presets` 保持 `ask` / `never`。

## 考虑过的替代方案

**把审批走 `dsh-user-questions`。** 否决：审批 seam 已经拥有封闭结果、审计对和失败关闭默认；再套一层问答会另造映射，并丢掉 `cancelled` 与 `unavailable` 的区分。

**像 ACP 一样要求 `callId`。** 否决：TUI 可以用 `toolName` 和 `reason` 展示，不必挂到已流式输出的卡片上；hook 与升级询问有时没有 call id。

**在 `workspace-write` 下自动放行。** 否决：那会删掉该预设已经选中的 `ask` 策略。

## 后果

交互式 `dsh` 可以在终端里批准或拒绝单次工具调用。没有这个应答者的主机仍然失败关闭。已安装与源码 TUI 共用同一监听器；headless 与 web 保留各自的通道。

## 测试

`packages/bundle/tui/tests/approval.spec.ts` 用假 overlay 驱动 picker：Allow once、Reject、Escape、预先中止与进行中中止、外部 hide，以及外会话 agent 的 `next()`。`tui.spec.ts` 启动 FakeTerminal 会话、打开一轮、调用 `ctx.approval.request`，并确认回车结算为 `allowed-once`。仍没有无密钥的组装 TUI 快照；展示仍由包内语义矩阵钉住。

## 相关

- [审批 seam](2026-07-06-approval-seam.md) — 本 overlay 应答的结果词汇、审计对和失败关闭默认。
- [随附交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 现在包含这条通道的组合。
