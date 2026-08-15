# Agent Note: TUI 会话 picker

Status: implemented

[English](2026-08-14-tui-session-picker.md) | 中文

## 问题

TUI 在启动时创建或恢复一个 Agent（`--resume` / `--session`），然后一直停在那个 id。列出和切换必须离开进程。OMP 的会话 picker 是日常路径；照抄它的全盘扫描或 terminal breadcrumb 会在 [`ctx.sessionQuery`](../../../../packages/session-query/session-query/README.md) 旁边再造一份目录。

## 决策

`/sessions` 和 `/sessions <id>` 直接调用 `ctx.sessionQuery`。picker 用 `filterSessions([])`，不再按 header 过滤：普通 fork 和 `origin: 'subagent'` 的子会话都会出现（[TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md)）。cwd 范围——各已记录 cwd，本进程 cwd 在前——见 [TUI /sessions 列出各已记录 cwd](2026-08-14-tui-sessions-across-cwds.md)。标题来自 `readTitleSnapshots`；整批失败时仍列出 id。选中当前 id 是空操作。正在运行的一轮会提示 `finish the current turn before switching sessions` 且不切换。

切换时先 resume 下一个 Agent。恢复失败则保留当前 Agent。下一个 handle 空闲后，`adoptHandle` 重置 transcript、subagent tracker 和统计监听，重放新日志，再 flush 并 dispose 上一个 handle。`/new` 在 `agents.create` 之后走同一条 adopt 路径（[TUI /new](2026-08-15-tui-new-session.md)）。`/fork` 在 `sessions.fork` 之后走同一条路径（[TUI /rename 与 /fork](2026-08-15-tui-rename-fork.md)）。收件箱和工具查找闭包读 `this.agent`，以便跟随切换。runtime 不 `inject(['sessionQuery'])`（与 TUI settings 同一类挂起）。

## 考虑过的替代方案

**re-exec `dsh --resume <id>`。** 否决：源码与已安装启动、bun 与 Node、以及 FakeTerminal 测试都要再开一个进程。进程内 resume 就是 `--resume` 已经在用的 factory。

**把全部持久化会话列成树。** 否决：picker 仍是一份可搜索列表。在这份扁平列表里包含 subagent origin 的子会话见 [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md)。其他 cwd 会列出；见 [TUI /sessions 列出各已记录 cwd](2026-08-14-tui-sessions-across-cwds.md)。

**自动打开浏览器那种分组工作区列表。** 作为第二层 overlay 否决：TUI picker 仍是一份可搜索列表，靠排序分组。

## 后果

交互式 `dsh` 可以在不重启的情况下切换对话。启动路径仍是 `--resume`。斜杠自动补全还会建议用户可调用的 skill 名称（[TUI skill 斜杠补全](2026-08-14-tui-skill-slash-complete.md)）。

## 测试

`packages/bundle/tui/tests/sessions.spec.ts` 钉住 cwd 分组顺序、title 与 id 标签，以及描述里的 `subagent` 标记。`transcript.spec.ts` 和 `subagents.spec.ts` 钉住 `reset()`。`tui.spec.ts` 在 `pnpm run test:tui` 下启动 FakeTerminal 会话：缺少 `sessionQuery` 会提示、picker 对当前 id 按 Enter 保持 Agent、`/sessions <id>` 在运行中拒绝，随后切换并更新页眉，并且 fork 行与 subagent origin 行列在一起。仍没有无密钥的组装 TUI 快照。

## 相关

- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 本 overlay 所切换的、启动时一个会话的组合。
- [TUI 登录 overlay](2026-08-14-tui-login-overlay.md) — 同一套 overlay 命令模式。
- [TUI skill 斜杠补全](2026-08-14-tui-skill-slash-complete.md) — 斜杠目录同时建议用户可调用的 skill。
- [TUI /sessions 列出各已记录 cwd](2026-08-14-tui-sessions-across-cwds.md) — 目录不再按本进程 cwd 过滤。
- [TUI /new](2026-08-15-tui-new-session.md) — 经同一条 adopt 路径创建空白会话。
- [TUI /rename 与 /fork](2026-08-15-tui-rename-fork.md) — fork 走同一条 adopt 路径；picker 保留普通 fork。
- [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md) — picker 也列出并恢复 `origin: 'subagent'` 的子会话。
