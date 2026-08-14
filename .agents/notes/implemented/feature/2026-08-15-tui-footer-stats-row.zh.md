# Agent Note：基于持久会话投影的 TUI 页脚统计行

Status: implemented

English | [中文](2026-08-15-tui-footer-stats-row.md)

## 问题

Web UI 展示了 TUI 没有的逐会话指标：缓存命中率、计费输入与输出 token 总量、解码吞吐、轮数，以及 context 占用。TUI 的 `SessionFooter` 只渲染 cwd 和一行 busy/subagents/model，`applyEvent` 也忽略 usage 与 request/context 记录。持久 fold 其实早已存在——`token-meter` 通过共享的 `ctx.sessionProjections` 缝注册 `tokenUsage` / `contextPressure` / `contextBreakdown`，`session-stats` 注册 `sessionStats`，并在分页与压缩后依然有效——但 TUI bundle 从未挂载 `session-stats`，也没有任何 TUI 代码读取该缝，所以这些数字在终端里无法触达。

## 决策

页脚改为可变高度。`SessionFooter.render` 在第一行画 cwd，第二行在有内容时画持久统计行，最后一行画 busy/subagents/model。`SessionChrome` 本就用 `footer.length` 计算空白填充，因此多出的行不需要改 chrome。统计行在首轮上报 token 用量之前为空，故引导阶段页脚仍是两行。

`src/stats.ts` 是唯一格式化处，镜像 Web 的 `StatsLine` + `ContextMeter` 计算：`cacheHitPercent` 为 `cacheRead / (uncachedInput + cacheRead + cacheWrite)`，`contextOccupancy` 取 `projectedTokens` 回退到 `pressureTokens` 除以 `contextWindow` 并截到 100%，`formatTokens` / `formatTokensPerSecond` 复用 Web 的紧凑形式。同一行追加启发式 `contextBreakdown` 组成（[TUI 页脚 context 分解](2026-08-14-tui-context-breakdown.md)）。`statsLine` 丢弃每个无数据的分组，其余以 ` · ` 连接，无可展示内容时返回 `''`。

`TuiApp.wireStats` 读取一次一致的 `ctx.sessionProjections.snapshot(agent.session)` 切片并订阅 `onChanged`，过滤到本 app 自己的会话；每次变更调用 `refreshStats` 与 `requestRender`。`stop` 释放监听器。TUI 只消费该缝，不拥有任何 fold。`session-stats` 现由 TUI patch 挂载（token-meter 已由 `dsh-base` 挂载），`token-meter`、`session-projection`、`session-stats` 声明为 bundle 的依赖与 tsconfig 引用，使 `SessionProjectionMap` 增强为切片值提供类型。

## 考虑过的替代方案

**在 TUI 里 fold 会话日志来推导统计。** 否决——持久投影是每个指标的单一来源，且已在分页与压缩下存活；在 TUI 里重新 fold 会重复该逻辑并在压缩下漂移，正是投影要消除的失败。

**调用 `llm.resolveModelInfo` 取 context 窗口。** 否决——`contextPressure.contextWindow` 由 `request/context` 记录经投影携带，占用率的分子分母来自同一次一致切片，无需逐渲染的路由查询。

**把页脚固定为三行，首轮前统计行留空。** 否决——常驻空行在引导阶段浪费一行 transcript；可变高度页脚只在 `statsLine` 非空时才画该行，`SessionChrome` 的填充算学会吸收高度变化。

**在模型行上连同 effort 标签显示 context 占用。** 否决——模型标签已承载 `provider / model · effort`；再追加占用率会在窄 TTY 上溢出，并把路由元数据与 token 计费混在一起。专用统计行把两件事分开，镜像 Web 在 `StatsLine` 与 `ContextMeter` 之间的拆分。

## 后果

TUI 页脚现在与 Web UI 的逐会话统计显示对齐：缓存命中率、计费输入/输出 token、解码吞吐、轮数与 context 占用，全部在分页与压缩下持久。TUI 是该投影缝的只读消费者；唯一的组合变更是把 `session-stats` 加入 TUI patch，并把三个投影包加入 bundle manifest。状态 chip 复用 `refreshStats`（[TUI 会话状态 chip](2026-08-14-tui-session-status-chips.md)）。

## 测试

`tests/stats.spec.ts` 钉住纯格式化器：`formatTokens` 紧凑形式、`cacheHitPercent` 无计费时为 null 与占比计算、`contextOccupancy` 两者皆知前为 null 与截断、`formatTokensPerSecond` 舍入，以及 `statsLine` 的分组丢弃与连接。`tests/chrome.spec.ts` 断言页脚在 cwd 与模型行之间插入统计行、按宽度截断、清空时隐藏。`tests/tui.spec.ts` 通过 `bench()` 接一个 `ctx.sessionProjections` 桩，断言首轮前页脚保持两行，首轮计费投影值到达后变为三行并含 `cache 90%`、`ctx 38% 48K/128K`、`3 turns`，且对另一会话的变更被忽略。全部在 `pnpm run test:tui` 下；仍无 keyless 组装 TUI 快照，故按测试策略由包级语义矩阵钉住这一瞬态呈现。

## 相关

- [Projected token usage and request context](2026-07-29-projected-token-usage-and-request-context.md) — 本行读取的 `tokenUsage` / `contextPressure` 投影。
- [Replay token-meter service](2026-07-15-replay-token-meter-service.md) — 注册它们的 `ctx.tokenMeter` 服务。
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — 该 chrome 所在的 bundle。
- [TUI `/model` 档位 picker 与页脚档位显示](2026-08-15-tui-model-effort-picker.md) — 页脚标签的另一组件，此处未改动。
- [TUI 会话状态 chip](2026-08-14-tui-session-status-chips.md) — `refreshStats` 同时绘制的强调行。
- [TUI 页脚 context 分解](2026-08-14-tui-context-breakdown.md) — 本行上的 `~sys` / `~tools` / `~msg` 分组。