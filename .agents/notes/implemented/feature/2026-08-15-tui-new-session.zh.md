# Agent Note: TUI /new

Status: implemented

[English](2026-08-15-tui-new-session.md) | 中文

## 问题

`/sessions` 只恢复已持久化的顶层会话。出现 `turn/start` 后 `/preset` 锁定，TUI 没有进程内打开空白会话的路径。要换另一份常驻组合，只能离开进程再启动。

## 决策

`/new` 调用 `agents.create`，使用新的 `session-${uuid}`、`cwd: process.cwd()`，并在挂载了 `ctx.agentPresets` 时取 `presets.resolve()` 的花名册默认。先创建，失败则保留当前 Agent。随后 `adoptHandle` 按 `/sessions` 同一条路径切换活 handle：等到空闲、重置 transcript / subagent tracker / 统计、重放新日志、提示 `new session ${id}`，再 flush 并 dispose 上一个 handle。正在运行的一轮会提示 `finish the current turn before starting a new session`。不改进程 cwd。当前会话即使仍为空白也会拿到新 id。

## 考虑过的替代方案

**在 `/sessions` picker 加一行「新建」。** 否决：恢复与创建是不同 factory；picker 行会把这一点藏起来，而锁定 `/preset` 之后的日常路径就是这条命令。

**re-exec `dsh`。** 否决理由与 [TUI 会话 picker](2026-08-14-tui-session-picker.md) 相同：源码与已安装启动、bun 与 Node、以及 FakeTerminal 测试都要再开一个进程。

**`process.chdir` 或工作区 picker。** 否决：`/new` 保持启动时的工作目录，与 `/sessions` 相同。

**继承当前会话的 preset。** 否决：锁定之后需要 `/new` 的调用方要的是花名册默认，好再选一次 `/preset`。

## 后果

已开始的 TUI 对话可以在不重启的情况下打开空白会话。`/sessions` 仍是恢复目录。页眉快捷键在 `/sessions` 旁列出 `/new`。

## 测试

`tests/chrome.spec.ts` 钉住页眉快捷键中的 `/new`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `/help` 列出 `/new`、运行中拒绝、创建新 id 并清空上一份 transcript，并在已开始的会话上经 `/new` 解锁 `/preset`。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 会话 picker](2026-08-14-tui-session-picker.md) — `/new` 与恢复共用的 adopt 路径。
- [TUI agent presets](2026-08-14-tui-agent-presets.md) — `/new` 重置的空白会话锁。
- [TUI /sessions 列出各已记录 cwd](2026-08-14-tui-sessions-across-cwds.md) — `/new` 同样不改进程 cwd。
- [TUI /rename 与 /fork](2026-08-15-tui-rename-fork.md) — `/fork` 复制本会话，而不是创建空白会话。
