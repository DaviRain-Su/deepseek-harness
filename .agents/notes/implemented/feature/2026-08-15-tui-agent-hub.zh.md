# Agent Note: TUI Agent Hub

Status: implemented

[English](2026-08-15-tui-agent-hub.md) | 中文

## 问题

单运行页脚行和 subagent 运行卡片的滚动工具调用 feed 只能说明某个 subagent 存在、最后碰了哪个工具，但子代理自己的推理、完整工具序列与已装配消息仍然不可见。卡片把活动砍到六行，且只折叠 `tool/call` 标题；并发委派除一行状态外无法区分，也没有办法读某个子代理的完整 transcript。这是 [TUI subagent 运行卡片](2026-08-14-tui-subagent-run-cards.md) 中暂缓的对标 OMP 后续工作。

## 决策

Alt+A 与 `/agents` 打开 Agent Hub——一个底部锚定的 picker，列出每个被跟踪的运行（运行中与刚结束的），数据来自 `SubagentTracker.roster()`（label、provider、状态、子会话 id）。选中一行打开 `AgentTranscriptOverlay`：一个全屏 `ScrollView`，内含一个以子代理为作用域的 tool lookup 构造的 `TranscriptView`。子会话已有事件以 `applyEvent(event, true)` 重放；app 的 `session/event` 监听器在 overlay 打开期间把匹配的实时事件路由给 `overlay.applyEvent`。Escape、Ctrl+C 或 Alt+A 关闭。

- `SubagentTracker` 新增 `roster()` 与 `SubagentRosterEntry`，并在 `RunState` 上记录 `runId`、`childSessionId`、`stopReason`，使已结束条目携带其 `subagent/end` 原因。
- 子会话 `Session` 对运行中的运行经 `ctx.get('agents')?.get(childId)?.session` 解析；对 handle 已释放的已结束运行回退到 `ctx.get('sessions')?.get(childId)`；store 已驱逐的会话改为提示而非打开。
- overlay 复用 `TranscriptView`，因此继承与父 transcript 相同的 thinking 块、Markdown 与工具卡片渲染。不消费任何新 session 事件；本特性对已有信号只读。
- `TuiApp` 新增 `openAgentHub` 与 `openAgentTranscript`、一个由 `hideOverlay()` 与会话切换 `reset()` 清理的 `agentTranscript` 路由字段、Alt+A 键绑定、`/agents` 命令，以及页眉提示（`alt+a agents`、`/agents`）。窗口标题与页脚单运行行不变。

## 备选方案

**把子代理的推理与文本折叠进运行卡片。** 否决：卡片是紧凑摘要，第二个可滚动界面才能让完整 transcript 可读。复用 `TranscriptView` 避免第二种 fold 格式，并与父 transcript 展示一致。

**只有 `/agents` 名册、无 transcript overlay。** 否决：纯状态名册与页脚单运行行重复；价值在于完整 transcript 的下钻。

**`--resume` 时重建 hub。** 超出范围：`subagent/start` / `subagent/end` 是瞬时的，hub 只展示 tracker 当前持有的运行，`--resume` 不会重新填充。已记录为已知限制，与运行卡片相同。

## 影响

新文件 `src/agent-hub.ts` 导出 `AgentTranscriptOverlay` 与 `showAgentTranscriptOverlay`。hub 是前一条笔记暂缓的对标 OMP 界面；该笔记的"桌面通知或 `/agents` 名册"备选方案现指向本笔记。页脚单运行行（见 [TUI subagent 运行卡片](2026-08-14-tui-subagent-run-cards.md)）与运行卡片仍是一览层；hub 是下钻层。

## 测试

`tests/subagents.spec.ts` 覆盖 `roster()` 对运行中运行、已结束运行以及 `reset()` 之后的情形。`tests/tui.spec.ts` 覆盖空 hub 提示、有运行时 picker 打开、transcript overlay 重放子日志并折叠实时 `tool/call`，以及 Escape 关闭并清除路由状态。

## 已知限制与待办

store 已驱逐子会话的已结束运行改为提示而非打开。`--resume` 既不重建 hub 也不重建运行卡片；委派的持久工具调用与结果仍在父 transcript 中重放。

## 相关

- [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md) — `/sessions` 把已持久化的子会话恢复为活 Agent；hub 只查看。
- [TUI subagent 运行卡片](2026-08-14-tui-subagent-run-cards.md) — hub 下钻的一览层。