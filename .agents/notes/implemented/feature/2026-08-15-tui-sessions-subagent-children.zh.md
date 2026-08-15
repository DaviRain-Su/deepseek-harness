# Agent Note: TUI /sessions 打开 subagent 子会话

Status: implemented

[English](2026-08-15-tui-sessions-subagent-children.md) | 中文

## 问题

`/sessions` 列出普通 fork，但隐藏 `origin: 'subagent'`，因此已持久化的子运行无法从 picker 恢复。[TUI Agent Hub](2026-08-15-tui-agent-hub.md) 查看已跟踪运行的 transcript，不切换活 Agent。[TUI /rename 与 /fork](2026-08-15-tui-rename-fork.md) 把打开这些子会话列为暂缓。

## 决策

`/sessions` 列出 `filterSessions([])` 的每一行，包括 `origin: 'subagent'`。没有 header 过滤。subagent origin 行的描述带 `subagent` 标记。选中一行，或 `/sessions <id>`，经与其他对话相同的 `adoptHandle` 路径在进程内 resume。正在运行的一轮仍会拒绝。不改进程 cwd。picker 仍是一份扁平可搜索列表——没有 Web 那种树，也不按父会话分组。

`/agents` 仍是 `SubagentTracker.roster()` 上的只读 overlay。子会话的 agent 若仍已注册，resume 会按现有提示大声失败，与其他注册冲突相同。

## 考虑过的替代方案

**subagent 子会话继续不进 `/sessions`，只提供 `/agents`。** 否决：hub 以 tracker 为范围，且不能在 `--resume` 后存活；已持久化的子会话是查询目录里已有的会话。

**按父会话分组的树 overlay。** 否决：SelectList 没有不可选的分组标题，第二层 overlay 还会挡住已经能同时搜标题、id 和路径的模糊搜索。

**接管活的子 handle，而不是 resume。** 否决：TUI 只拥有一个 Agent handle；与仍已注册的子会话冲突是 resume 失败，不是第二条所有权路径。

## 后果

已持久化的 subagent 子会话可以成为活的 TUI 会话。`/agents` 仍不切换。普通 fork 和顶层对话仍在同一份列表里。

## 测试

`tests/sessions.spec.ts` 钉住描述里的 `subagent` 标记。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下列出与 fork、其他 cwd 行在一起的 subagent origin 行，且 `/sessions <id>` 会恢复一个 store 创建、header `origin` 为 `subagent` 的子会话。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 会话 picker](2026-08-14-tui-session-picker.md) — 本目录现在用子会话填充的 overlay 与进程内 resume。
- [TUI /rename 与 /fork](2026-08-15-tui-rename-fork.md) — 本笔记落地的剩余项。
- [TUI Agent Hub](2026-08-15-tui-agent-hub.md) — 查看而不切换。
- [TUI /sessions 列出各已记录 cwd](2026-08-14-tui-sessions-across-cwds.md) — cwd 分组不变。
