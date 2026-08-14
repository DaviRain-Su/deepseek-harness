# Agent Note：TUI 设置 Inventory 面板

Status: implemented

[English](2026-08-15-tui-inventory-panel.md) | 中文

## 问题

`/settings` 中心的 Phase 3 清单（Appearance / Models / Plugins / Permission / Presets / Inventory）列出了 Inventory 面板，但早先的 seam 调查断言 Cordis 没有 TUI 可达的插件枚举 seam，于是推迟了它。那次调查搜索的是 Cordis core，没有搜 vendored loader，因此漏掉了 TUI 本身就运行其上的枚举入口。

## 决策

Inventory 面板不需要新 seam。vendored 的 `@deepseek-ai/cordis-plugin-loader` 在 `Context` 上声明了 `ctx.loader: Loader`，而 `Loader.entries()` 产出每个已挂载插件 `Entry`（`options.id`、`options.name` 模块说明符、以及一个 `disabled` getter）。TUI 通过 `ctx.get('loader')` 读取可选 loader；缺少 loader 时显示 notice，并保持中心关闭。一个只读 `OverlayPicker` 列出已挂载条目——以完整路径 id 为 value、模块说明符为 label、置位时加 `disabled` 标记——Esc 关闭。中心新增一行 `Inventory`；选中一行会收起该视图且不改变任何状态，因为这里的配置面是只读清单，而非启用/禁用控制。

`PluginInventoryEntry`（扁平的 `id` / `name` / `disabled`）与 `PluginInventorySource`（`entries(): Iterable<PluginInventoryEntry>`）在 `settings.ts` 中以结构化接口声明，镜像 `PermissionPresetSource`。已挂载的 loader 并不直接满足 `PluginInventorySource`（`Entry` 携带的是 `options.name` 与 `options.disabled`，而非扁平字段），因此 `openInventoryPicker` 把 `Entry → PluginInventoryEntry` 做一次适配，再交给 `inventoryRows`。扁平形状让 `settings.spec.ts` 无需 loader 即可用普通 source 构造行。

## 备选方案

**基于 `ctx.llm` 的只读 Models/Inventory 概览。** 作为 Inventory 面板被否决：`/model` 已通过 `listProviders` / `listModels` / `resolveModelInfo` 列出实时 LLM 路由，LLM 概览会与之重复。Inventory 枚举的是 loader 的已挂载插件树，与实时模型路由是不同的轴。

**插件控制服务。** 对本面板否决：启用/禁用插件是一个真正的能力 seam（Service Definition / Provider / Consumer），且无当前消费者，规模远大于只读清单。Inventory 面板是只读的那一半；控制是另一个独立的 Plugins 面板。

**包裹 loader 的新枚举服务。** 否决：`ctx.get('loader')?.entries()` 本就是枚举入口且在 TUI 可达范围内，包裹服务只会复制 loader，无当前 owner 与 need。

## 后果

Inventory 无需新 seam 即可行；早先“没有枚举 seam”的结论（搜的是 Cordis core）是错的，在此更正。`/settings` 现交付三块面板——Appearance、Permission、Inventory。剩余面板真正的 seam 投入尚未动：Presets 需要把 `@deepseek-ai/dsh-agent-presets` 挂进 TUI profile（它会注册一个建议性的 `agent/created` 监听器，除非 TUI 也组合会话，否则会发出警告，因此挂载是一次组合行为变更，不只是加面板）；Plugins 需要一个 plugin-control 能力 seam。Models 则需要基于 `LlmConfigurableProvider.settingsNs` 段的 schema 驱动 provider-settings 表单编辑器。

## 测试

`tests/settings.spec.ts` 钉住 `inventoryRows`（loader 顺序、disabled 标记与省略、空列表）。`tests/tui.spec.ts`（`pnpm run test:tui`）覆盖缺少 loader 的 notice，并提供一个 fake `loader`（`await: () => Promise.resolve()` 让启动时的 `ctx.get('loader')?.await()` 落定，外加 `entries()`），提交 `/settings`，导航到 Inventory 行，打开 picker，再 Esc 关闭。TUI 没有无密钥装配快照工具；包级语义矩阵钉住该面板，与设置中心先例一致。

## 相关

- [TUI 设置中心](2026-08-15-tui-settings-hub.md) — 本面板所扩展的中心；记录了 Appearance 与 Permission 面板。
- [TUI 实时模型目录](2026-08-14-tui-live-model-catalog.md) — `/model` picker，Inventory 不与之重复的同源路由。