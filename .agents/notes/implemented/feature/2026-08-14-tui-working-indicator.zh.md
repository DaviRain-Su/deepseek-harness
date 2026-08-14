# Agent Note: TUI Thinking loader 与流式绘制范围

Status: implemented

[English](2026-08-14-tui-working-indicator.md) | 中文

## 问题

按下 Enter 之后，TUI transcript 在持久 `user/message` 和首个 token 到达之前保持静止。页脚只显示 `enter append · ctrl+c cancel`。主题已经暴露 `spinnerFrames`，但没有任何动画，因此即使用很快的模型，看起来仍像空闲，用户也无法判断 Agent 是否在工作。每条实时 `assistant/chunk` 都调用完整的 `tui.requestRender()`，Markdown 也会对每个 delta 重新分词。

## 决策

`TuiApp` 把一个 OMP `Loader` 挂到 transcript 容器的最后一个子节点，标签为 `Thinking`，spinner 用 accent 色、文案用暗色，帧来自 `TUI_SYMBOL_THEME.spinnerFrames`。submit、`step/start`、`user/message` 和 `tool/result` 会显示或把它抬到尾部（先 `removeChild` 再 `addChild`）。首个非空 `reasoning-delta` 或 `text-delta`、`turn/end`、Ctrl+C 以及 `stop()` 会隐藏它（`Loader.stop` / `dispose`）。`tool/call` 会留下同一个 loader 并改标签（[工具执行期间的 working loader](2026-08-14-tui-tool-working-loader.md)）。忙碌 inbox 的 pending 行也会抬一次 loader，让它留在尾部。

空闲 Enter 在 `followup()` 之前调用 `transcript.paintUser(line)`。随后同一文本的 `user/message` 被跳过（`lastPaintedUser`）。忙碌 Enter 仍走 [TUI 在运行中追加输入](2026-08-14-tui-busy-append.md) 的 pending `appending` / `queued` 行，不会再画一个气泡。

实时 `assistant/chunk` 的文本与 reasoning delta 调用 `tui.requestComponentRender(transcriptMount)`，而不是整棵树重绘。`AssistantMessageBlock` 在流式期间打开 Markdown `transientRenderCache`，并在活的 `assistant/message` 上 `settle()`。OSC `setProgress` 在本轮忙碌或有 subagent 运行时打开。

## 备选方案

**只在页脚转圈。** 否决：用户盯的是 transcript，不是状态行。

**把 `ThinkingBlock` 兼作等待指示。** 否决：该块是持久 `reasoning-delta` 正文。把等待态和 reasoning 混在一起，会先出现空的 Thinking 标题，再长成模型思考。

**移植 Web QueueDock 的活动 chrome。** 否决；TUI 没有 dock，缺的是 transcript 内的动态效果，以及更便宜的流式绘制。

**每个 chunk 仍走整棵树的 `requestRender`。** 否决：这正是快模型上仍然显得贵的路径；子树绘制加上瞬时 Markdown 缓存才是已交付的修复。

**空闲气泡仍等到持久 `user/message`。** 否决：即使首 token 很快，Enter 之后 transcript 仍会空白一段时间。

## 影响

模型沉默时 transcript 有动态；有 token 时让位。pending 工具调用会留下转圈（[工具执行期间的 working loader](2026-08-14-tui-tool-working-loader.md)）。`Loader` 构造时就会启动定时器，因此 `stop()` 必须 `hideWorking`——包括从不 `quit` 的测试。组装态 TUI 仍没有无 key 快照；`pnpm run test:tui` 下的包测试钉住该指示器。

## 测试

`tests/transcript.spec.ts` 钉住 `paintUser` 跳过匹配的持久 `user/message`，以及 `AssistantMessageBlock.settle()`。`tests/tui.spec.ts` 断言空闲 submit 后出现 `Thinking` 与 `⠋`、首个 `text-delta` 与 Ctrl+C 时隐藏、`tool/call` 时保留并改标，以及忙碌时的 OSC 进度。`tests/theme.spec.ts` 钉住 `spinnerFrames`。

## 相关

- [工具执行期间的 working loader](2026-08-14-tui-tool-working-loader.md) — 工具运行时同一个 loader 继续转。
- [TUI 在运行中追加输入](2026-08-14-tui-busy-append.md) — 忙碌 pending 行；本笔记负责空闲乐观绘制与等待 loader。
- [TUI bun runtime 与 pi-ai catalog](2026-08-14-tui-omp-engine-and-catalog.md) — OMP `Loader` / `spinnerFrames`，以及真正 reasoning 用的 `ThinkingBlock`。
- [TUI subagent 运行卡片](2026-08-14-tui-subagent-run-cards.md) — 与活的 subagent 运行共享 OSC 进度。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 这套 chrome 所在的组合包。
