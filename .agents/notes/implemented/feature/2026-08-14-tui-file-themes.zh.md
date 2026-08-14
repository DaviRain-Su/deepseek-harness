# Agent Note: TUI 文件主题

Status: implemented

[English](2026-08-14-tui-file-themes.md) | 中文

## 问题

`/theme` 只能切换四份内存调色板。选完重启就丢，overlay 显示原始 id，也没法丢进自定义颜色文件。oh-my-pi 已经有用户手里的文件主题；把颜色手抄进 TUI 源码不是产品路径。

## 决策

TUI 通过 `installSettingsSection` 持有 `tui-theme` 设置命名空间（字段 `theme`，默认 `dark`），模式与 `agent-default-model` 相同：有 settings 提供方就可选。组合配置 `theme` 是 base 层；提供方叠加上一次 `/theme` 的选择。apply 时 `ctx.settings` 已在，或 Loader 结算之后，才会注册；没有提供方时保持组合默认值，不会 `inject(['settings'])` 干等。

自定义调色板在 `$DSH_HOME/themes/<id>.json`（`dshHomePath('themes')`）。目录不存在等于空目录。与内置 id 冲突时内置赢。stem 必须匹配 `^[A-Za-z0-9][A-Za-z0-9._-]*$`。解析接受扁平调色板对象，或 oh-my-pi 文档（`colors` 加可选 `vars`）；多余键忽略；`toolDiffAdded` / `toolDiffRemoved` 别名 `diffAdd` / `diffDel`；值是 `#rgb` / `#rrggbb`、256 色索引、var 名，或 `""`（终端默认）。嵌套 var 检测环。本包不内置 oh-my-pi 那套打包的默认 JSON。

选择器给内置项标 Dark / Tokyo Night / Catppuccin / Light，自定义行标 `custom`。应用会改活的 `TUI_COLOR` 对象、invalidate transcript 容器、`requestRender`，并 `settings.replace` 该 id。选中的文件读不了或非法时 notice，不切换。启动时保存的 id 未知则 notice，并保持活调色板（初始为 `dark`）。`themeInternals.themesDir` 是测试钩子，避免真实 `$DSH_HOME/themes` 污染 `listTuiThemes()`。

Web 的 `ui-theme`（`preference: light|dark|system`）仍是另一套 token。

## 备选方案

**把 oh-my-pi 大约 80 份默认 JSON 打进来。** 否决：四份内置已经覆盖交付的 chrome，`$DSH_HOME/themes` 才是用户把已有 OMP 文件带进来的方式。

**监视 themes 目录和 `settings.yaml`。** v1 否决；打开选择器时会再读文件，选中的 JSON 直到下次 apply 才重新解析。

**OSC 11 自动深/浅色、nerd/ascii 符号包、语法高亮 token、OMP 状态行 token。** 暂缓；它们不是这套调色板。

**复用 Web `ui-theme`。** 否决：TUI token（工具卡片、diff、Markdown chrome）不是 `light|dark|system`。

**选中的坏文件静默回退到 `dark`。** 否决；配置错误必须用 notice 暴露。

## 影响

把一份 oh-my-pi 主题 JSON 放到 `$DSH_HOME/themes/` 并在 `/theme` 里选中，就会画 chrome、气泡、Markdown、工具卡片和 diff。有 settings 提供方时，重启会恢复该 id。TUI 不绘制的键会被忽略，因此一份 OMP 文件仍可能缺某个 TUI 必需 token 而拒绝应用。没有实时重载，也不附带 OMP 默认包。

## 测试

`tests/theme.spec.ts` stub `themeInternals.themesDir`，钉住内置项、自定义列表与冲突、OMP `vars` / 256 / 空值 / 别名、非法 JSON、环，以及 `fg('')`。`tests/tui.spec.ts` 钉住 Config `{ theme: 'dark' }`、从假 settings 段恢复、下一次选择的持久化，以及未知保存 id 的 notice。仍然没有无密钥的组装 TUI 快照。

## 相关

- [TUI 的 bun 运行时与 pi-ai 目录](2026-08-14-tui-omp-engine-and-catalog.md) — 内置调色板和 OMP chrome 适配；本笔记负责文件加载与持久化。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 该选择器所在的组合包。
