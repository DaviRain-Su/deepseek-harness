# Agent Note：TUI 设置中心

Status: implemented

[English](2026-08-15-tui-settings-hub.md) | 中文

## 问题

TUI 此前把 `/model` 和 `/theme` 作为各自独立的斜杠命令，没有统一入口。base profile 已经挂载 `ctx.permissionPresets`，但终端缺少切换“沙箱模式 + 审批策略”预设束的进程内入口；唯一的预设入口是 TEXT 版 `/permission` 命令。

## 决策

新增 `/settings` 命令，打开一个以子面板为行的 `OverlayPicker` 中心。3a 先交付 Appearance 与 Permission。Appearance 直接复用 `/theme`（`openThemePicker`），不另立存储。Permission 是架在 `PermissionPresetService` 上的 `OverlayPicker`：行按 `optionOf(name)` 的声明顺序排列，预选当前预设（`source.current(session.events)`），仅当生效 knob 不匹配任何预设时追加一行 `custom`。确认某条表项会调用 `source.set(session, name)`（记录 `permission/preset` 事件并写入沙箱/审批 knob）并提示 `permission <name>`；`custom` 行是空操作——`custom` 是派生态、不可设置；Escape 或外部 hide 以不写入收场。中心在打开子面板前先隐藏自身，保证同一时刻只有一个 overlay 处于焦点。

`PermissionPresetSource` 在 `settings.ts` 中以结构化接口本地声明；已挂载的 `PermissionPresetService` 满足该接口，因此纯行构造器与 picker 测试无需引入 service 类。TUI 包把 `@deepseek-ai/dsh-permission-presets` 加为 peer 与 dev 依赖，并在 `tsconfig.json` 增加一条 project `reference`。没有该 reference，源码面的类型检查会把 `permission-presets` 的 src 拉入，它类型引用 `dsh-shell` → `dsh-subprocess` 的 src，落到 TUI `rootDir` 之外。

## 考虑过的备选

**为外观另起一份设置存储。** 否决：`tui-theme` 已通过 `ctx.settings` 持有配色 id；另起存储会复制持久化路径。`/settings` 把 Appearance 路由到 `/theme`。

**真正的 `custom` 切换。** 否决：`CUSTOM_PRESET` 命名的是“会话 knob 不匹配任何表项”这一派生态，没有可写的 spec；该行仅用于提示当前状态。

**在 Permission 面板上加 allow-always 授权存储。** 否决：一次性 approval overlay（`Allow once` / `Reject`）已覆盖逐次调用升级；allow-always 授权存储是另一项决策，不在本面板。

## 后果

`/settings` 是会话设置的唯一入口；后续面板（Models、Plugins、Inventory）会新增中心行。Permission 面板是 TEXT `/permission` 之外首个面向 `ctx.permissionPresets` 的进程内入口。轮次进行中切换预设会写入当前会话的 knob，并记录 `permission/preset` 事件，因此日志可重建生效模式。

## 测试

`tests/settings.spec.ts` 固定 `settingsHubRows`、`permissionPresetRows`（声明顺序、描述缺省省略、custom 行追加）以及 `promptPermissionPreset`（确认写入 + 隐藏、custom 不写入、escape 取消、外部 hide）。`tests/tui.spec.ts`（`pnpm run test:tui`）提交 `/settings`，断言 `/help` 列出它、中心打开，确认 Appearance 进入主题 picker，再 escape 关闭。TUI 仍无 keyless assembled snapshot harness；由包语义矩阵固定本中心。

## 相关

- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md)——本中心扩展的命令平面。
- [TUI approval overlay](2026-08-14-tui-approval-overlay.md)——本面板互补的一次性 Allow once / Reject overlay。
- [TUI live model catalog](2026-08-14-tui-live-model-catalog.md)——`/model` picker，同级的子面板。