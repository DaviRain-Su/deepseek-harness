# Agent Note: TUI /todos 列出站立投影

Status: implemented

[English](2026-08-15-tui-todos-picker.md) | 中文

## 问题

TUI 页脚已经从站立 `todos` 投影画出 `N/M todos`。chip 只是计数。`/jobs` 会列出对应的 `ctx.jobs` 行；没有命令能看出 todo 条目本身。点击 chip 已被否决：页脚是纯文本。

## 决策

`/todos` 打开 `sessionProjections.snapshot(session).values.todos` 的 picker。选中一行会提示 `status · content`。picker 不改写清单；`todo_write` 仍是模型工具。缺少 `ctx.sessionProjections`、缺少 `todos` 单元、以及 null 或空列表都会提示。`/todos` 不进页眉快捷键。`/help` 会列出它。

## 考虑过的替代方案

**可点的页脚 chip，用来打开 `/plan`、`/goal` 或 `/todos`。** 否决：页脚是纯文本；鼠标命中测试等于发明 chrome。`/plan` 和 `/goal` 已经是宿主命令。

**不用 overlay，直接提示整份清单。** 否决：`/jobs` 已经用 overlay-picker 做同一类可见性。

**TUI 动词编辑或清空 todos。** 否决：站立清单是 `todo_write` 的 last-write-wins。再加一个写入方会和模型可见日志漂掉。

## 后果

活着的 TUI 会话可以读出页脚只计数的站立清单。下一次 `turn/start` 仍按 Web 的方式清空投影；之后的 `/todos` 会提示 `no todos in this session`。

## 测试

`tests/status.spec.ts` 钉住 `/todos` picker 行。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `/help` 列出 `/todos`、缺少投影服务时提示、未挂载单元和空列表时提示，再打开桩 snapshot 并提示选中行。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 会话状态 chip 与 /jobs](2026-08-14-tui-session-status-chips.md) — 本命令列出的计数 chip。
- [TUI 会话选择器](2026-08-14-tui-session-picker.md) — `/todos` 复用的 overlay 命令模式。
- [下一轮 turn/start 清空 todo 计划](2026-07-28-todo-plan-clears-on-next-turn.md) — 为何 `turn/start` 之后再打 `/todos` 可能为空。
