# Agent Note：TUI settings 分节

Status: implemented

[English](2026-08-14-tui-settings-sections.md) | 中文

## 问题

Web 的设置界面从 `ctx.settings.describe()` 列出每个已注册命名空间。TUI hub 已有 Inventory（loader 条目）和 Settings file（文档路径），却没有这些写入落入的命名空间，用户看不到有哪些分节、哪些已有用户层。

## 决策

当 `ctx.settings.describe` 是函数时，`/settings` 在 Inventory 之后追加一行 Sections。确认后打开 `describe({ redactSecrets: true })` 的只读 picker：标签是命名空间，描述是 `applies`，存在 `user` 时再加 `overridden`。确认一行若有字段名则打开只列名称的 picker（[TUI settings 分节字段](2026-08-14-tui-settings-section-fields.md)）；否则提示 `settings <ns> · <applies>`，有用户层时加上 `overridden`。空的 describe 提示 `no settings sections`。该面板不调用 `mutate`。

## 考虑过的替代方案

**为每个命名空间做按 schema 驱动的编辑器。** 否决：那是 Web 的插件配置表单。缺口是说出已注册分节。

**把解析后的 `value` 打进提示。** 否决：同进程 `describe()` 不打码；提示不得打印机密。

**始终显示 hub 行并提示 `settings are not mounted`。** 否决：缺少 `describe` 就是没有名册，和 Settings file 在缺少路径时省略一行一样。

## 后果

hub 会说出已注册的 settings 命名空间。Models 和 Settings file 仍是写入与路径行。字段值和按 schema 驱动的编辑仍不走这条路径。

## 测试

`tests/settings.spec.ts` 钉住 hub 行和 `settingsSectionRows`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下从桩 `describe()` 提示被覆盖的分节，并在列表为空时提示 `no settings sections`。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 本行加入的 hub。
- [TUI settings 文件路径](2026-08-14-tui-settings-file-path.md) — 同一 hub 上的文档路径行。
- [TUI settings 分节字段](2026-08-14-tui-settings-section-fields.md) — 确认一行后的只列名称字段 picker。
