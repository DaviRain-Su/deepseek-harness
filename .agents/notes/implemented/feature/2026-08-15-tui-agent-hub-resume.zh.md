# Agent Note: TUI Agent Hub 在 --resume 下存活

Status: implemented

[English](2026-08-15-tui-agent-hub-resume.md) | 中文

## 问题

Agent Hub 只列出内存中 `SubagentTracker` 持有的运行。`subagent/start` 与 `subagent/end` 是瞬态 scoped agent 事件，因此 `--resume` 既不重新填充 tracker 也不重建 hub 名册，且选中一行无法打开其会话已不在场的子代理。前一条 [TUI Agent Hub](2026-08-15-tui-agent-hub.md) 笔记曾把此作为已知限制暂缓。

## 决策

从持久化的子代理枚举重建名册，而非引入新的持久化事件。`openAgentHub` 把 `SubagentTracker.roster()`（live 条目，带丰富的 `thinking` / `running <tool>` 状态）与 `SubagentRuntime.listChildren(parentSessionId)`（基于 projection 的、每个持久化子代理的枚举，含 live 与冷、带 label 与 mode）按子会话 id 去重合并。`--resume` 后 tracker 丢失的子代理从 `listChildren` 重新出现；descriptor 尚未 append 的创建窗口内的子代理仍从 tracker 出现。

`openAgentTranscript` 不再接收 live `Session`；`AgentTranscriptOverlay` 改收 `readonly SessionEvent[]`。新增 `SubagentRuntime.loadChildEvents(childId, signal?)` 返回子代理事件：在场时从 `ctx.get('sessions')` 取该会话事件，否则对冷子代理做一次 `sessionPersistence.inspect` 读取。overlay 重放这些事件；`session/event` 监听器在 overlay 打开期间继续折叠实时事件。无法加载事件（既无 live 会话也无持久化行）的子代理改为提示而非打开。

两个 opener 现在都是 async，并在枚举与持久化读取期间以 `overlayOpening` 守护，使并发的 opener 不会与 await 结果竞态。

- 不改 `SessionEventMap`，不改 `lifecycle.ts`：`subagent/start` 与 `subagent/end` 保持瞬态。持久性来自已有的 `listChildren` 语料，已被 session-query 路径在生产中验证。
- `loadChildEvents` 只读，不做 projection fold 或生命周期校验；既无 live 会话也无持久化行时返回 `undefined`（而非报错），使已消失的子代理对 hub 而言是能力缺失。
- `openAgentTranscript` 的 live 回退（`ctx.get('sessions')?.get(childId)?.events`）使 hub 在挂载了 session store 但未挂载 `SubagentRuntime` 的组合中仍可用——那里 `loadChildEvents` 不可达。

## 备选方案

**把 `subagent/start` / `subagent/end` 变成 append 到父日志的持久化 session 事件。** 否决：`lifecycle.ts` 会经 `parent.session` append，但 parent 在生产中是 live `Agent`，在 `service.spec.ts` 中是裸 `{ id }` 假对象，所以 append 会在不给整个 subagent 测试套接入真实 `SessionStore` 的情况下炸掉全部生命周期单测；还会跨两个包的类型图新增两个 `SessionEventMap` 成员。其边际价值——在 `--resume` 时重建一行 `⏵` 运行卡片，紧挨本就在父 transcript 重放的委派 `tool/call` + `tool/result`——不抵此契约改动。

**把生命周期持久化进子日志而非父日志。** 否决：父 transcript 只重放父日志，子日志事件在父侧什么也不重建；而 hub 的 `loadChildEvents` 已读取子日志，才是真正的下钻。

## 影响

`SubagentRuntime` 新增 `loadChildEvents(childId, signal?)`。`AgentTranscriptOverlay` 改收 `readonly SessionEvent[]` 而非 `Session`。`TuiApp.openAgentHub` 与 `openAgentTranscript` 为 async，并把 tracker 与 `listChildren` 合并。[TUI Agent Hub](2026-08-15-tui-agent-hub.md) 笔记的 `--resume` 限制与其"`--resume` 时重建 hub"备选方案现指向本笔记。父侧 `⏵` 运行卡片在 `--resume` 下仍不重建；委派的持久化工具调用与结果仍是父侧可见的痕迹。

## 测试

`packages/subagent/subagent/tests/list-children.spec.ts` 覆盖 `loadChildEvents` 对在场子代理、从持久化 inspect 的冷子代理、未知 id（inspect 拒绝 → `undefined`），以及既无 store 也无持久化的上下文。`packages/bundle/tui/tests/tui.spec.ts` 覆盖合并后的名册 picker、overlay 经 live 回退重放子日志，以及实时事件折叠。

## 已知限制与待办

父侧 `⏵` 运行卡片在 `--resume` 下不重建；只有 hub 重建。被删除并在同一 id 下重新发布的子代理返回该 id 当前持有的内容；`loadChildEvents` 不像 `listChildren` 那样校验生命周期，因为只读 inspect 倾向可用性而非陈旧身份拒绝。

## 相关

- [TUI Agent Hub](2026-08-15-tui-agent-hub.md) — 本笔记将其扩展到 `--resume`；其 `--resume` 限制在此解决。
- [TUI subagent 运行卡片](2026-08-14-tui-subagent-run-cards.md) — 父侧一览层，在 `--resume` 下仍只 live。