# Agent Note: TUI /rename 与 /fork

Status: implemented

[English](2026-08-15-tui-rename-fork.md) | 中文

## 问题

TUI 可以切换到已持久化的对话，也可以打开空白会话，但没有进程内钉住标题或复制活日志的路径。Web 已经经 [`ctx.sessionTitle.rename`](../../../../packages/session/session-title/README.md) 和 [`ctx.sessions.fork`](../../../../packages/core/session/README.md) 写入。要改名，或从一份复制的前缀开始，只能离开进程到另一界面。`/sessions` 还隐藏所有带 `parentSession` 的行，因此成功 fork 之后，子会话会从 picker 里消失。

## 决策

`/rename [title]` 对活会话调用 `ctx.sessionTitle.rename`。非空参数立即写入。空参数打开与其他 TUI 写入相同的文本表单。正在运行的一轮可以改名。缺少 `ctx.sessionTitle` 时提示 `session titles are not mounted`。标题规范化后为空时提示服务错误（`session title must contain visible characters`）。页眉仍显示会话 id；钉住的标题由 `/sessions` 折叠出来。

`/fork` 在一轮正在运行时拒绝（`finish the current turn before forking this session`），然后对活会话调用 `ctx.sessions.fork`（最近一次已完成轮次边界；空源会 fork 出空子会话），再经与 `/sessions`、`/new` 相同的 `adoptHandle` 路径恢复子会话。fork 或 resume 失败则保留当前 Agent。不改进程 cwd。页眉快捷键在 `/sessions` 旁列出 `/fork`。`/rename` 不进页眉。

`/sessions` 调用 `filterSessions([])` 并列出普通 fork。打开 `origin: 'subagent'` 的子会话见 [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md)。

## 考虑过的替代方案

**用 `/rename` 写常驻默认。** 否决：标题是会话本地的；设置里的默认是另一份存储。

**fork 之后 re-exec `dsh --resume`。** 否决理由与 [TUI 会话 picker](2026-08-14-tui-session-picker.md) 相同：源码与已安装启动、bun 与 Node、以及 FakeTerminal 测试都要再开一个进程。

**把 `/rename` 放进页眉快捷键。** 否决：快捷键行已经挤；`/help` 会列出该命令。

**从 `/sessions` 打开 subagent origin 的子会话。** 归 [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md)：扁平列表带 `subagent` 标记，仍然没有树。

**`/fork` 之后 picker 仍过滤 `parent: null`。** 否决：切换后子会话不会出现在列表里。

## 后果

TUI 对话可以在不重启的情况下钉住标题，并在最近一次已完成轮次处拆分。`/sessions` 会把该 fork 和其他对话列在一起。空白会话路径仍是 `/new`。

## 测试

`tests/chrome.spec.ts` 钉住页眉快捷键中的 `/fork`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `/help` 列出 `/rename` 和 `/fork`、缺少标题服务时提示、从参数和表单写入标题、拒绝空白标题、一轮运行中拒绝 `/fork`，并把历史复制到带 `parentSession` 的子会话。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 会话 picker](2026-08-14-tui-session-picker.md) — `/fork` 与恢复共用的 adopt 路径，以及现在保留 fork 的 picker 过滤。
- [TUI /new](2026-08-15-tui-new-session.md) — `/fork` 不替代的空白会话创建路径。
- [TUI /sessions 列出各已记录 cwd](2026-08-14-tui-sessions-across-cwds.md) — `/fork` 同样不改进程 cwd。
- [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md) — `/sessions` 列出并恢复 `origin: 'subagent'` 的子会话。
