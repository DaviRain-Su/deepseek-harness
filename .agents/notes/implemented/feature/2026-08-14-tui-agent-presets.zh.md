# Agent Note: TUI agent presets

Status: implemented

[English](2026-08-14-tui-agent-presets.md) | 中文

## 问题

Web 用 [`dsh-agent-presets`](../../../../packages/preset/agent-presets/README.md) 为每个会话组合能力。TUI 把面向模型的工具留在宿主平面，从未挂载花名册，因此没有 `/preset`，TUI 会话也无法共用 Web 的常驻组合。

## 决策

TUI patch 插入 `agent-presets`（`default: standard`），并禁用与 Web 相同的宿主平面工具行，避免会话同时看到两份拷贝。它还插入 [`dsh-cordis-host-runner`](../../../../packages/extensions/cordis-host-runner/README.md)，以便随附的 `cordis` preset 能激活 `tool-cordis`；浏览器 client runner 不挂。`apps/cli` 的 `composeProfile` 仍在该行存在时补上随附根目录。`tui-runtime` 在 `agents.create` 之前解析默认值，以便 `meta.agentPreset` 写入 header；在 `setup` 里 `mount`；恢复时 `mount` `resolveSessionPreset(session)`。`/preset` 列出花名册，在空白会话上 `recompose`，并追加 `agent-preset/selected`。挂载了 `ctx.agentPresets` 时，`/settings` 提供 Agent preset 行打开同一个 picker，以及 Default preset 行，经 `ctx.settings.mutate` 写入 `agent-presets.default`。该 picker 省略损坏的花名册行；Clear 会 unset 用户层默认，让组合默认重新生效。下一次 `/new` 读取实时的 `defaultId`。选中已经是默认的项是空操作。出现 `turn/start` 后组合锁定。缺少 `ctx.agentPresets` 时提示，并保留宿主组合。子 agent 仍走 `composeFrom()`，绝不按 id 再 `mount()`。`composedPreset` 有答案时，页脚显示 `preset <id>`。

## 考虑过的替代方案

**挂载花名册但不禁用宿主工具。** 否决：agent 会同时看到 base 注册和常驻挂载。

**两步式、工作区风格的 preset 编写 UI。** 否决：复制/删除仍留在 Web General 页；TUI 只选择当前会话和站立默认。

**让 `/preset` 同时写入站立默认。** 否决：Web 把 General 默认和当前会话切换分开；已经开始的 TUI 会话仍要先 `/new` 才能再跑 `/preset`。

**第一轮之后仍允许 `/preset`。** 否决：`recompose` 不读历史；中途换工具会留下新组合做不出的已记录调用。调用方持有空白检查，与 Web 的 select 路径相同。

## 后果

随附的 `dsh` TUI 会话跑在 `standard` 上，除非日志记录了另一个 preset。去掉 `agent-presets` 行的无花名册 overlay 必须同时去掉宿主平面禁用，否则会话没有工具。[随附 TUI profile](2026-08-13-shipped-tui-profile.md) 不再把工具留在宿主平面。

## 测试

`tests/presets.spec.ts` 固定 `sessionBlank`、`presetPickerItem`、`defaultPresetRows`，以及 `cordis.patch.yml` 里的 host-runner 行。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下提示缺失花名册、创建时 mount `standard`、`/preset code` 重新组合、在 `turn/start` 后锁定，从 `/settings` hub 打开同一个 picker，并写入或清除 `agent-presets.default`。仍然没有无密钥的组装 TUI 快照。

## 相关

- [随附 TUI profile](2026-08-13-shipped-tui-profile.md) — 本笔记更新的「工具留在宿主平面」一句。
- [TUI 会话状态 chip](2026-08-14-tui-session-status-chips.md) — 现在包含 `preset` 的页脚 chip 行。
- [TUI /new](2026-08-15-tui-new-session.md) — 已开始的会话再开一份空白会话，以便再次 `/preset`。
