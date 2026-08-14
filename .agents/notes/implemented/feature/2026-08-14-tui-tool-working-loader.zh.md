# Agent Note: 工具执行期间的 TUI working loader

Status: implemented

[English](2026-08-14-tui-tool-working-loader.md) | 中文

## 问题

[Thinking loader](2026-08-14-tui-working-indicator.md) 在 `tool/call` 时隐藏，好让 pending 工具卡片占据尾部。那张卡片是静止的 `●` / `❯` / `✎` 盒子。一次很长的 `bash` 或类似调用会让 transcript 完全不动，读起来像卡住。

## 决策

`tool/call` 留下同一个 OMP `Loader`，并用最新一张未完成卡片的 `presentCall` 标题改标（`TranscriptView.pendingWorkLabel()`）。`tool/result` 在本轮仍忙碌时恢复 `Thinking` 标签。流式 token 仍会隐藏 loader：那些行本身就是动态。pending 卡片仍是状态盒；转圈是尾部小组件，不是卡片上的第二套定时器。

## 考虑过的替代方案

**在 pending `ToolCard` 标题上转圈。** 否决：`Loader` 已经持有帧定时器和 `requestRender`。每张卡片再开一个 interval 会复制那套时钟。

**只在页脚显示活动。** 原 loader 笔记已否决：用户盯的是 transcript。

**继续在 `tool/call` 时隐藏。** 否决：静止卡片不足以标示一次长时间运行的调用。

## 后果

活的一轮除非模型正在流出可见 token，否则尾部始终有一行在转。并行 pending 调用显示最新标题。

## 测试

`tests/transcript.spec.ts` 钉住 `pendingWorkLabel()` 在 call 与 result 之间的变化。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下提交一轮并卡住，应用 `tool/call`，断言出现 `⠋` 和调用标题且没有 `Thinking`，再应用 `tool/result` 断言 `Thinking` 回来。仍没有无密钥组装 TUI 快照去钉住逐帧转动。

## 相关

- [TUI Thinking loader 与流式绘制范围](2026-08-14-tui-working-indicator.md) — 本次调用所改标的 loader。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 这套 chrome 所在的 transcript。
