# Agent Note：TUI 浮层与 Agent 生命周期安全

Status: implemented

[English](2026-08-15-tui-overlay-and-agent-lifecycle.md) | 中文

## 问题

交互式 TUI 会在异步读取 catalog 后打开模型、会话和退出登录选择器。读取期间，第二个打开请求、审批提示或 TUI dispose 可能改变当前浮层；过期的 continuation 随后可能发布孤立的选择器，或替换仍在使用的 handle。Permission 设置还通过拓扑敏感的 context 属性读取可选服务，而 `followup()` 或 `steer()` 失败时不会产生可以清除状态的持久化轮次事件，工作指示器因此会保持激活。

TUI 持有 `ctx.agents.create()` 或 `resume()` 返回的 `AgentHandle`，但普通 `/exit`、Ctrl+D 和进程内 fiber dispose 并没有在所有路径上等待这个 handle 的 quiescent disposer。进程退出通常会掩盖泄漏；保留 context 的测试和宿主则可能让循环与有作用域的 Agent world 继续存活。

## 决策

`TuiApp` 一次只保留一个异步浮层操作。保留项记录 TUI renderer 与 generation；隐藏或替换浮层时使 generation 失效。Continuation 只有在 renderer、generation、停止状态和当前浮层槽位都仍匹配时才能发布。同步浮层打开器也遵守同一保留项，因此异步 catalog 读取不会被另一个选择器抢先。模型 effort 解析使用同一操作。login interaction 也接收 TUI abort signal，因此提供方在第一个 prompt 之前等待时，teardown 同样会取消它。

Permission preset 通过 `ctx.get('permissionPresets')` 读取。没有该服务的组合会报告 `permission presets are not mounted`，并保持 settings hub 关闭。

`TuiApp.quit()` 停止 renderer、刷新当前 session，并在请求进程退出前等待所持有的 handle disposer。插件 effect 使用 `TuiApp.dispose()` 执行相同的 quiescent teardown；重复的 dispose 调用共享同一个进行中的 promise。仅停止的方法保持同步，使输入回调可以请求恢复终端而无需等待。

交互式斜杠命令 handler 保持 login、logout 和 session switch 在后台运行，以便其浮层继续可用；每个 handler 都附带 rejection handler，把异步失败显示为 notice。用户消息接纳过程会收容异常。构造或投递消息抛错时，TUI 清除 busy 状态与工作 loader，并显示 notice，而不是留下没有任何 `turn/end` 可以清除的轮次指示器。

## 备选方案

**只在每个 await 后重新检查状态。** 否决，因为多个调用者仍可能在其中一个发布之前同时通过初始检查。保留项与 generation 还可以处理审批或 dispose 使 pending continuation 失效的情况。

**完全依赖 owner fiber dispose 每个 Agent。** 否决，因为 `/exit` 与 Ctrl+D 是进程内操作，session flush 和 handle dispose 必须在 launcher 收到退出请求前完成；fiber dispose 不是唯一的 teardown 路径。

**加入非 TTY 的 snapshot override。** 否决，因为它不会测试随附的交互路径。当前组装 snapshot runner 使用 Node 和已关闭的 stdin，而 TUI 要求真实 TTY 与 Bun；忠实的 snapshot 需要 PTY 输入回放 runner，应作为独立的测试基础设施改动。

## 影响

浮层 continuation 不能向已替换的 renderer 发布，也不能覆盖另一个当前浮层。TUI 停止时，pending 读取会被丢弃。进程内退出会在 session flush 后等待 Agent quiescence。消息接纳失败会对用户可见，并让 UI 回到 idle。

TUI 仍没有无密钥的组装 transcript snapshot。在 Bun 加 PTY 的 snapshot lane 建成前，现有证据是 package semantic matrix 与 CLI 组装后的非 TTY 失败检查。

## 测试

`tests/tui.spec.ts` 覆盖重复打开和 dispose 竞争中的 model picker、缺失与已挂载的 Permission preset 路径、消息接纳失败后的清理、fiber teardown 时的 Agent dispose，以及正常 quit 时的 dispose。加入这些用例后，现有 TUI package suite 通过。

## 相关

- [随附的交互式 TUI profile](../feature/2026-08-13-shipped-tui-profile.md) — 组合方式与现有的组装入口限制。
- [在运行中的轮次追加 TUI 输入](../feature/2026-08-14-tui-busy-append.md) — busy 状态下 `steer()` 与 `followup()` 的归属。
- [TUI settings hub](../feature/2026-08-15-tui-settings-hub.md) — Permission panel consumer。
- [`/model` 浮层实例绑定](2026-08-14-tui-model-overlay-this.md) — 同一组浮层 helper 的命令与快捷键归属。
- [Agent 生命周期与归属约定](../architecture/2026-06-18-agent-lifecycle-and-ownership-contracts.md) — `AgentHandle` 的归属与 quiescence。
