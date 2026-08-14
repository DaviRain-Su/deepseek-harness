# Agent Note: TUI 会话状态 chip 与 /jobs

Status: implemented

[English](2026-08-14-tui-session-status-chips.md) | 中文

## 问题

Web 在 composer chrome 里画出 plan、goal、todos 和后台任务。TUI 已经跑同一套 dsh-base 单元——`/plan`、`/goal`、`todo_write` 和 `ctx.jobs`——但页脚只显示 cwd、token 统计和模型。待生效的 `/plan`、站立 goal 或正在跑的 bash 任务没有持久的 TUI 状态。

## 决策

页脚在模型行上方插入一行强调 chip，数据来自当前 `plan` / `goal` / `todos` 投影切片和 `ctx.jobs.list(agent)`。`/jobs` 打开同一份列表的 picker；选中一行会提示状态、标签和详情。`/plan` 和 `/goal` 仍是宿主命令。缺少投影或 `ctx.jobs` 时省略对应 chip，`/jobs` 提示 `jobs are not mounted`。jobs 监听是进程级的；`refreshStatus` 只跟当前 Agent。picker 不取消任务。

## 考虑过的替代方案

**在 TUI 上做 GoalBar 动词和 plan-mode 开关。** 否决：命令平面已有 `/plan` 和 `/goal`。这次只补可见性，不另开控制路径。

**从 `/jobs` picker 里 kill。** 否决：取消仍走 jobs 工具。picker 只读 `list()`。

**TUI 自有一份状态存储。** 否决：投影和 `ctx.jobs` 已是 Web 在读的源。第二份存储会在 `/sessions` 切换和回放时漂移。

## 后果

活会话在这些事实存在时显示 `plan` / `plan…`、`goal <objective>`（持久 phase 不是 `active` 时为 `goal <phase> <objective>`）、`N/M todos`，以及 `N jobs` / `N jobs done`。dsh-base 挂载这些单元，普通交互式 `dsh` 无需额外组合就能看到 chip。

## 测试

`tests/status.spec.ts` 钉住 chip 文案和 `/jobs` picker 行。`tests/chrome.spec.ts` 钉住页眉 `/jobs` 提示，以及统计行与模型行之间的强调行。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下提示缺失或空的 jobs 服务、列出正在运行的任务并画出 `1 jobs`，以及从投影快照画出 plan / goal / todo chip。仍没有无密钥的组装 TUI 快照。

## 相关

- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 这些 chip 加入的页脚。
- [TUI 会话 picker](2026-08-14-tui-session-picker.md) — `/jobs` 复用的 overlay 命令模式。
- [TUI 页脚统计行](2026-08-15-tui-footer-stats-row.md) — chip 下方的持久统计行。
- [TUI /settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 与这些 chip 一起交付的设置中心名册。
- [TUI agent presets](2026-08-14-tui-agent-presets.md) — `preset <id>` chip。
