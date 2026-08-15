# Agent Note: TUI subagent 运行卡片

Status: implemented

[English](2026-08-14-tui-subagent-run-cards.md) | 中文

## 问题

TUI 之前完全看不见 subagent 的工作。`TranscriptView` 只折叠父会话的 user/assistant/tool 事件，app 的 `session/event` 监听器丢弃其余所有会话，于是一次委派只显示为一张带原始 JSON 参数的通用 pending 工具卡片，在父会话的 `tool/result` 到达之前一直沉默——看不到子代理存在、在做什么、如何结束。信号其实早已存在：瞬时的 scoped `subagent/start` / `subagent/end` 生命周期对携带 provider、子会话 id 与终止停止原因；子会话自己的持久事件（包括其 `subagent/descriptor` 创建标签）也通过 `session/event` 广播。本笔记扩展 [shipped-tui-profile](2026-08-13-shipped-tui-profile.md) 与 [tui-omp-engine-and-catalog](2026-08-14-tui-omp-engine-and-catalog.md) 交付的 TUI。

## 决策

每次运行一张实时卡片，由 `SubagentTracker`（[`src/subagents.ts`](../../../../packages/bundle/tui/src/subagents.ts)）持有，按时间顺序追加到 transcript 容器。

- `subagent/start` 打开一张标题为 `⏵ subagent · <provider>` 的 pending `ToolCard`；子日志的 `subagent/descriptor` 事件追加后，标题换成其持久的 `label`。
- tracker 按子会话 id 归键运行，把子日志的 `tool/call` 折叠成六行滚动活动 feed，展示走与父 transcript 相同的回退链（`presentToolCall` 现从 `transcript.ts` 导出；当 `ctx.agents` 仍持有子代理时，用活跃子代理解析工具定义）。失败的 `tool/result` 追加 `✗ <tool> failed`。
- `subagent/end` 收尾卡片：标题加上 `— <stopReason>`，正文保留活动尾部加一行 `<n> tool calls · <reason>` 摘要，非 `completed` 的原因涂错误底色。`ToolCard` 为此新增 `update(title, body)` 以就地更新 pending 进度。
- tracker 通过 `runsChanged(running, summaries)` 把每个运行中的运行上报给页脚。`SessionFooter.setSubagentRuns` 在状态行与模型行之间画一行暗色行——`⏵ label: status` 条目按启动顺序以 ` · ` 连接——只要还有运行就显示；空数组隐藏。每条 summary 的 `status` 在子会话 `tool/call` 仍 pending（尚未 `tool/result`）时为 `running <tool>`，否则为 `thinking`，由 tracker 已有的 `pendingTools` 映射派生，因此无需消费新事件。窗口标题仍用计数（空闲为 `dsh`，有运行时为 `dsh · <n> subagent(s) running`），OSC 进度同理（父轮次忙碌时也会打开）。真正收尾一次活运行的 `subagent/end` 写入 C0 BEL（`\a`）；重复与未知的 end 保持静音。拆卸在 `tui.stop()` 之前恢复空闲标题并清除进度。
- `TuiApp` 以非 scoped 方式监听 `subagent/start` / `subagent/end`（与 `hooks-claude-code` 相同的模式），并把非父会话的 `session/event` 路由给 tracker。嵌套委派与父代理的同级运行平铺渲染，而不是嵌在父卡片下。

## 备选方案

**把进度折叠进委派的工具卡片。** 否决：在 `tool/result` 携带 `runId` 之前，没有任何持久数据能把父会话的 `tool/call` 与子运行关联起来；而后台委派会立即结算其工具调用，运行却还在继续。独立卡片统一覆盖前台与后台运行。

**`--resume` 时重建运行卡片。** 否决：生命周期对是瞬时的，且子代理的活动存在于子会话自己的日志中，父会话从不加载它。已在包 README 中记录为已知限制；委派的持久工具调用与结果仍会正常重放。

**在卡片里渲染子代理的最终输出。** 否决：父会话的 `tool/result` 卡片已经携带完整报告；运行卡片只保留停止原因与计数。

**桌面通知或 `/agents` 名册面板。** 已交付的提醒是引擎已有的 `setTitle` / `setProgress` 外加 C0 BEL；对标 OMP 的 Alt+A 名册与全屏 transcript overlay 已作为 [TUI Agent Hub](2026-08-15-tui-agent-hub.md) 交付。

## 影响

`@deepseek-ai/dsh-tui` 新增对 `@deepseek-ai/dsh-subagent` 的 peer+dev 依赖，仅用于其类型与 `SessionEventMap` 合并；所有导入都是 type-only，因此 bun 产物永远不会加载该服务的 zod 树。bun 下的包测试无法导入 `dsh-subagent` 的运行时值——vite 的解析器无法从本包触及其 zod 依赖——因此测试对 run-id 品牌类型做断言转换，并将 descriptor 格式版本写字面量。组装态 TUI 原有的无 key 快照缺口不变：展示仍由 `pnpm run test:tui` 下的包语义矩阵覆盖。

## 测试

`tests/subagents.spec.ts`（bun）覆盖卡片打开/收尾与页脚计数、descriptor 标签、带工具展示的活动折叠、失败结果行、窗口滚动与 earlier 计数、外部会话拒绝、重复/未知生命周期边，以及单次运行的 `thinking` → `running <tool>` → `thinking` 状态切换——包括 `end()` 是否真正收尾一次运行。`tests/chrome.spec.ts` 覆盖专属 subagents 行、空数组时隐藏，以及 `subagentsRow` 的连接。`tests/tui.spec.ts` 中的应用级用例通过真实 `SessionStore` 分派发出生命周期对与子会话追加，断言页脚的单运行行（先 `⏵ subagent · in-process: thinking`，再 `⏵ <label>: running bash`）、运行中/空闲窗口标题、进度标志、捕获写入流中的 BEL，以及渲染后的卡片文本。
