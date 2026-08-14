# Agent Note: TUI /sessions 列出各已记录 cwd

Status: implemented

[English](2026-08-14-tui-sessions-across-cwds.md) | 中文

## 问题

Web 按工作区分组对话。TUI 的 `/sessions` picker 只列出 header cwd 等于 `process.cwd()` 的顶层会话，其他目录的会话看不见，除非用户已经知道 id 并传入 `--resume` 或 `/sessions <id>`。

## 决策

`filterSessions` 只保留 `parent: null`，去掉 cwd 条件。`isSwitchableSession` 仍隐藏 subagent `origin` 和带 `parentSession` 的行。排序上本进程 cwd（以及缺 cwd）在前，其余 cwd 按字母序，组内按 `createdAt` 最新。header 记了 cwd 时，行描述带上 `formatCwdForFooter`。选中其他 cwd 的行是进程内 resume，和 `--resume <id>` 一样；进程工作目录不变。

## 考虑过的替代方案

**两步工作区 picker（先 cwd，再会话）。** 本切片否决：SelectList 没有不可选的分组标题，第二层 overlay 还会挡住已经能同时搜标题、id 和路径的模糊搜索。

**切换时 `process.chdir`。** 否决：TUI 启动 cwd 才是工具工作区。`--resume` 恢复另一会话时也不改它。

**继续按 cwd 过滤。** 否决：到另一工作区对话的唯一路径是已知 id。

## 后果

`/sessions` 展示查询服务能看到的全部顶层对话。切到其他 cwd 的会话后，工具仍在启动工作目录里跑。subagent 子会话仍不进 picker。

## 测试

`tests/sessions.spec.ts` 钉住只保留顶层、cwd 分组顺序，以及描述里的 cwd。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下断言 `filterSessions` 只带 `parent: null`，且 `/other` 行排在本 cwd 之后。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 会话 picker](2026-08-14-tui-session-picker.md) — 本目录现在跨 cwd 填充的 overlay 与进程内 resume。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — picker 所切换的、启动时一个会话的组合。
