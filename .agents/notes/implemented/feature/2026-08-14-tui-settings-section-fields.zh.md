# Agent Note: TUI settings section fields

Status: implemented

[English](2026-08-14-tui-settings-section-fields.md) | 中文

## 问题

[Sections 名册](2026-08-14-tui-settings-sections.md) 能说出已注册命名空间，却说不出这些写入落入哪些键。用户能看到 `tui-theme` 存在且有用户层，看不到该分节有哪些字段。

## 决策

字段列表来自 `describe({ redactSecrets: true })`：打码后 `value` 的顶层键，再加上 `secrets` 里只有一段的条目，这样机密槽位仍有名称。确认带字段的命名空间会打开只列名称的 picker；确认一个字段会提示 `settings <ns>.<name>`，打码后的用户层含该键时再加上 `overridden`。没有字段名的分节仍提示命名空间。从不显示字段值。该面板不调用 `mutate`。

## 考虑过的替代方案

**遍历 `schema.toJSON()` 的 `{ uid, refs }` 取属性名。** 否决：该编码不是扁平属性表，遍历它就是按 schema 驱动编辑器的起点。

**把解析后的 `value` 打进提示。** 否决：即便打码后的值仍可能带非机密配置，提示不应打印；名称就够。

**调用未打码的 `describe()` 只取 `Object.keys`。** 否决：描述符仍会在 TUI 进程里持有机密值，相对 `secrets` 没有收益。

## 后果

Sections 能说出已注册命名空间的键。机密字段名会出现；其值和用户层标记不会，因为打码会从 `user` 去掉这些键。写入仍走 Models 和主题 picker。

## 测试

`tests/settings.spec.ts` 钉住 `settingsSectionFields` 和 `settingsSectionFieldRows`。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下从带 `value` 和 `secrets` 的桩 `describe()` 提示被覆盖的字段。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI settings 分节](2026-08-14-tui-settings-sections.md) — 本 picker 所在的命名空间名册。
