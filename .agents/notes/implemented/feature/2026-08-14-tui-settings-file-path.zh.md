# Agent Note：TUI settings 文件路径

Status: implemented

[English](2026-08-14-tui-settings-file-path.md) | 中文

## 问题

Web 可以打开用户可编辑的 settings 文档。TUI 的 `/settings` hub 能写密钥、切换预设，却从不说出 `ctx.settings.documentPath`，用户看不到这些写入落在哪份文件。

## 决策

当 `ctx.settings.documentPath` 有值时，`/settings` 追加一行 Settings file。描述是该路径的 `~/…` 形式。确认该行会提示绝对路径。缺少路径或非文件提供方则省略该行。TUI 不拉起编辑器，也不调用 `prepareDocument()`。

## 考虑过的替代方案

**用 `$EDITOR` 打开文件。** 否决：会挂起或与 TUI 进程抢占；提示路径就够在别处打开。

**一个编辑插件配置的 General 面板。** 否决：那需要 schema 驱动的编辑器。缺口是说出文件名。

**始终显示该行并提示 `no local settings file`。** 否决：服务把缺失路径当作没有打开文档的能力。

## 后果

存在本地 settings 文件时，hub 会说出它。Models 仍不手改 YAML。

## 测试

`tests/settings.spec.ts` 钉住额外行和 `~/…` 描述。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下从桩 `documentPath` 提示绝对路径。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI settings Models 面板](2026-08-14-tui-settings-models-panel.md) — 本行加入的 hub。
- [TUI 可写 Models](2026-08-14-tui-writable-models.md) — 落入该文件引用的凭据写入。
