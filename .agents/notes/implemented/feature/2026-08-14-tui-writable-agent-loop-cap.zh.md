# Agent Note: TUI 可写 agent-loop 上限

Status: implemented

[English](2026-08-14-tui-writable-agent-loop-cap.md) | 中文

## 问题

Web 的 Plugins agent-loop 卡片在 `agent-loop` 设置命名空间上写入 `maxParallelToolCalls`。该字段就是用户拥有的整段。TUI `/settings` 已经能写两个 shell 整数，但并行工具上限仍要手改 `settings.yaml`。

## 决策

当 `describe()` 列出 `agent-loop` 时，`/settings` 在 Shell 之后插入 Agent loop 一行。选中后打开 Set parallel cap；用户层点名 `maxParallelToolCalls` 时出现 Clear parallel cap。写入复用 Shell 的正整数表单和 `settings.mutate`。组合里的 `agents` 数组仍不走这条路径——它在服务启动时被消费一次。缺少该命名空间时省略这一行，以免打乱已有 hub 导航。

## 考虑过的替代方案

**并进 Shell picker。** 否决：它在另一个命名空间、另一张 Web 卡片上。

**按 schema 驱动的 Plugins 编辑器。** 否决：这段只有一个用户拥有的字段；遍历 schema 仍是已拒绝的编辑器。

## 后果

`/settings` → Agent loop 可以限制下一组工具调用，而不打开 YAML。Clear 只在用户覆盖时出现。

## 测试

`tests/settings.spec.ts` 钉住 hub 行和 `agentLoopActionRows`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `describe()` 列出 `agent-loop` 时打开该行，并经桩 `settings.mutate` 设置与取消 `maxParallelToolCalls`。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 可写 shell timeout](2026-08-14-tui-writable-shell-timeout.md) — 本路径所抄的整数写入。
- [TUI 可写 web search](2026-08-14-tui-writable-web-search.md) — 同一 hub 上的另一条 Plugins 写入。
- [TUI settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 本行所在的 hub。
