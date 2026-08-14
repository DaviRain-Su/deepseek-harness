# Agent Note: TUI 可写 shell timeout

Status: implemented

[English](2026-08-14-tui-writable-shell-timeout.md) | 中文

## 问题

Web 的 Plugins bash 卡片在 `shell` 设置命名空间上写入 `timeoutMs`。TUI `/settings` 已经能写字符串和凭据字段，但前台命令超时仍要手改 `settings.yaml`。该字段就是执行器已经在断言的一个正数。

## 决策

当 `describe()` 列出 `shell` 时，`/settings` 在 Web search 之后插入 Shell 一行。选中后打开 Set timeout；用户层点名 `timeoutMs` 时出现 Clear timeout。Set 复用 `LoginTextForm`（非密文）。空白草稿拒绝；非数字和零拒绝。TUI 不发明上限——执行器的正有限断言就是上限。Set 把 `{ op: 'set', path: ['timeoutMs'], value }` 写成数字；Clear 对该路径 `unset`，让组合默认值重新生效。`maxOutputBytes`、`cwd` 和其他 shell 字段仍不走这条路径。缺少该命名空间时省略这一行，以免打乱已有 hub 导航。

## 考虑过的替代方案

**按 schema 驱动的 Plugins 编辑器（每个 shell 和 agent-loop 字段）。** 否决：遍历 `describe().schema` 就是 TUI 已经拒绝的编辑器。一个已知整数，和 Models 写字符串是同一种写入。

**同时写 `maxOutputBytes`。** 暂缓：这次破例只要一个数字。输出上限是 Web 卡片上的下一个兄弟字段，不属于本路径。

## 后果

`/settings` → Shell 可以覆盖前台超时，而不打开 YAML。Clear 只在用户覆盖时出现，不会对解析后的默认值出现。

## 测试

`tests/settings.spec.ts` 钉住 hub 行、`positiveIntRefusal`、`userNamesField` 和 `shellActionRows`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `describe()` 列出 `shell` 时打开该行，并经桩 `settings.mutate` 设置与取消 `timeoutMs`。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 可写 web search](2026-08-14-tui-writable-web-search.md) — 同一 hub 上的另一条 Plugins 写入。
- [TUI 可写 base URL](2026-08-14-tui-writable-base-url.md) — 本数字写入所抄的字符串 mutate。
- [TUI settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 本行所在的 hub。
