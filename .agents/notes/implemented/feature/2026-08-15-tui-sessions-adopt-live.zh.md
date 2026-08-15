# Agent Note: TUI /sessions 接管仍已注册的 Agent

Status: implemented

[English](2026-08-15-tui-sessions-adopt-live.md) | 中文

## 问题

`/sessions` 总是调用 `agents.resume`。子会话的 agent 若仍已注册（活着的 subagent）会抛 `already registered`。[TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md) 已经列出这些行，并把冲突当成 resume 失败。

## 决策

`switchSession` 先查 `ctx.agents.get(id)`。命中则借用该 Agent（disposer 为空操作），并把先前 TUI 拥有的 handle 停放起来，以免 dispose 父会话拆掉仍在跑的子会话。切回已停放的 id 会恢复那个拥有的 handle。未命中仍走 resume。TUI 正在运行的一轮仍会拒绝。`/agents` 仍不切换。

已在 `running` 的被借用 Agent 按活会话显示；`adoptHandle` 不等 `whenIdle`。

## 考虑过的替代方案

**继续把冲突当成大声的 resume 失败。** 否决：目录已经给出这一行，而 `/agents` 不能变成活会话。

**借用时 dispose 先前的 handle。** 否决：先前的 Agent 常常是子会话的 owner；dispose 它会取消用户刚打开的工作。

**在活着的子会话旁边再 resume 一个 TUI 拥有的 Agent。** 否决：`register` 禁止同一 session id 上有两个 agent。

## 后果

`/sessions` 切到活着的 subagent 子会话时，直接成为该会话，不再第二次走 factory。退出时 dispose 停放的 TUI 拥有 handle 和当前 handle。借用的 disposer 仍是空操作。

## 测试

`tests/tui.spec.ts` 在 `pnpm run test:tui` 下先 resume 一个 store 创建的子会话使其注册，`/sessions` 接管同一个 Agent，父会话仍保持注册，切回去恢复父会话。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md) — 子会话仍活着时本路径打开的目录。
- [TUI Agent Hub](2026-08-15-tui-agent-hub.md) — 查看而不切换。
