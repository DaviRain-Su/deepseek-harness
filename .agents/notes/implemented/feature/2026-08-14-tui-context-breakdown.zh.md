# Agent Note：TUI 页脚 context 分解

Status: implemented

[English](2026-08-14-tui-context-breakdown.md) | 中文

## 问题

Web 的 ContextMeter 面板展示启发式 `contextBreakdown` 拆分（`systemTokens` / `toolsTokens` / `messageTokens`）。TUI 页脚已经用 `contextPressure` 画了总占用，却没读这份组成，因此很长的系统提示词或工具 schema 看起来和很长的对话一样。

## 决策

`statsLine` 从占用率分组已经读取的同一次 `ctx.sessionProjections` 切片追加 `~sys` / `~tools` / `~msg`。`~` 前缀与 Web 一致：这三个数字是计量器的固定启发式，加起来不等于 `projectedTokens`。三个数字都为零时省略该分组，空白会话的页脚仍是两行。没有第二行页脚，也没有 overlay。

## 考虑过的替代方案

**像 Web ContextMeter 那样点开面板。** 否决：TUI 没有指针持有的 composer chrome；统计行已经是 token 数字的家。

**第四行页脚。** 否决：占用与组成是同一切片；专用行会为统计行已经放得下的拆分挡住 transcript。

**把三个数字加总成第二个总量。** 否决：token-meter 写明它们不会等于 `projectedTokens`；展示总和会看起来像计费总量。

## 后果

持久统计行同时显示占用与组成。TUI 仍不拥有任何 fold。语言、Trajectory、附件和赞/踩仍是已记录的 TUI 限制。

## 测试

`tests/stats.spec.ts` 钉住全零隐藏与带 `~` 的紧凑形式。`tests/tui.spec.ts` 断言桩切片带上 `contextBreakdown` 后，接好的页脚含有这三个分组。全部在 `pnpm run test:tui` 下。仍无 keyless 组装 TUI 快照。

## 相关

- [TUI 页脚统计行](2026-08-15-tui-footer-stats-row.md) — 本分组加入的可变高度统计行。
- [Composer context-meter 分解](2026-08-05-composer-context-meter-breakdown.md) — Web 面板与 `contextBreakdown` 投影。
