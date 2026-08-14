# Agent Note: TUI transcript 的压缩与反馈 chrome

Status: implemented

[English](2026-08-14-tui-transcript-chrome.md) | 中文

## 问题

Web 把压缩和逐条反馈做成一等 chrome。TUI transcript 忽略 `compaction/summary` 和 `feedback/record`，恢复会话时这些日志事实不可见。其余若干 Web 面没有 TUI 接缝：语言、Trajectory、附件、赞/踩。

## 决策

`TranscriptView.applyEvent` 在 `compaction/summary` 上画一行暗色 `compacted`，在 `feedback/record` 上画一行暗色 `feedback: <text>`。`/feedback` 仍是已挂载的 `dsh-command-feedback` 命令。语言、Trajectory、文件附件和赞/踩记为 TUI 限制，不另造 chrome。

## 考虑过的替代方案

**在 transcript 旁再做一张 Trajectory 表。** 否决：transcript 就是对话。

**在 `dsh-message-feedback` 上做赞/踩快捷键。** 否决：该伴随记录只属于 Web；TUI 不挂载它。

**新增 TUI 语言设置命名空间。** 否决：没有这样的命名空间；发明一个是产品决策。

## 后果

恢复与实时追加都会在 transcript 里显示压缩和会话级反馈。README 列出其余仅 Web 的面。

## 测试

`tests/transcript.spec.ts` 在 `pnpm run test:tui` 下画出这两行。仍然没有无密钥的组装 TUI 快照。

## 相关

- [TUI agent presets](2026-08-14-tui-agent-presets.md) — 本次其余 Web 对齐切片。
