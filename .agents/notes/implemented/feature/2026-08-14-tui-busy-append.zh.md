# Agent Note: TUI 在运行中追加输入

Status: implemented

[English](2026-08-14-tui-busy-append.md) | 中文

## 问题

Agent 轮次进行时 TUI 编辑器仍可输入，但 Enter 一律调用 `agent.followup()`，把内容排进 **next-turn**。该条目在当前多步轮次结束、持久 `user/message` 落盘之前对 transcript 不可见。Ctrl+C 的 `cancel({ kind: 'user' })` 还会丢掉未领取的 inbox，因此运行中键入的一行可能毫无痕迹地消失。Pi、Codex 及同类产品会把新输入在下一步边界送进当前轮次。引擎已通过 `agent.steer()` 暴露该路径；Web 的忙碌 composer 也走它（[web-queue-steer-action](2026-07-30-web-queue-steer-action.md)）。TUI 从未调用。

## 决策

`TuiApp.submit` 在 `agent.status === 'running'` 时把非 slash 文本交给 `agent.steer()`，空闲时交给 `agent.followup()`。slash 命令不变。`steer()` 是尽力而为：next-step 窗口已关闭时，同一条消息被改列为会唤醒的 next-turn follow-up，与引擎以及 Web composer 对新输入的约定一致。

`TranscriptView` 为 Agent 运行期间到达的、来源为用户的 inbox 插入绘制暗色斜体 pending 行：id 在 `inbox.nextStep` 时为 `appending · {text}`，否则为 `queued · {text}`。空闲插入仍等到持久 `user/message` 气泡。pending 行在 `agent/inbox/claimed`、`agent/inbox/discarded` 以及匹配的持久 `user/message` 上消失；pi-tui `Container` 没有 `removeChild`，因此 dismiss 让后续 render 为空。`TuiApp` 非 scoped 监听这些 inbox 事件，并过滤 `agent === this.agent`。忙碌页脚为 `enter append · ctrl+c cancel`。Ctrl+C 仍不带 `keepInbox` 取消，未领取的 pending 行随 inbox 一起消失。

## 备选方案

**Enter 继续走 `followup()`，只画一行 Queue。** 否决：用户在 Agent 工作时的意图是加入当前轮次，而不是等新轮次。引擎已经区分两种目标。

**空闲 Enter 也调用 `steer()`。** 否决：空闲 `steer()` 会以 next-step 输入启动一轮。保守切分与 Web 空闲 composer 一致：首条/空闲行是普通 follow-up，只有运行中的轮次才 steer。

**移植 Web QueueDock 的编辑/删除和严格的行内 steer。** 否决。TUI 新键入的输入没有需要保全的已排队条目；`agent.steer()` 的 follow-up 回退正是 Web 笔记已经分配给 TUI 调用方的约定。

**空闲 follow-up 也显示 pending 行。** 否决：每次普通发送都会在用户气泡前闪一下 `queued ·`。空闲投递仍走持久 `user/message`。

## 影响

忙碌时 Enter 在下一步边界加入当前轮次，而不是等到 `turn/end` 之后。未领取的 steering 仍会在 Ctrl+C 时消失。transcript 内仍不能编辑/删除 pending 行，也没有组装态 TUI 的无 key 快照；`pnpm run test:tui` 下的包测试钉住运行中提交、pending 绘制/消失，以及页脚提示。

## 测试

`tests/transcript.spec.ts` 钉住 pending 绘制、空文本 no-op、重复 id no-op、dismiss 幂等，以及持久 `user/message` 交接。`tests/tui.spec.ts` 卡住第一轮，断言忙碌 Enter 追加 `next-step` 并绘制 `appending`、claim 清掉该行、运行中的 next-turn 插入绘制 `queued`、Ctrl+C discard 清掉它。`tests/chrome.spec.ts` 钉住忙碌状态行上的 `enter append`。

## 相关

- [把已排队的 Web 消息插入当前轮次](2026-07-30-web-queue-steer-action.md) — Web Queue 与 composer `steer()`；本笔记是 TUI 对尽力而为 `agent.steer()` 的消费方。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 这条输入路径所在的组合包。
