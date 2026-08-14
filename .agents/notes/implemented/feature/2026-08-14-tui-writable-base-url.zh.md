# Agent Note：TUI 可写 base URL

Status: implemented

[English](2026-08-14-tui-writable-base-url.md) | 中文

## 问题

[可写 Models](2026-08-14-tui-writable-models.md) 的 picker 能存 API key，却不能存 `baseURL`。代理或自定义网关仍要手改 `settings.yaml`。该字段是普通字符串，和 `apiKeyEnv` 走同一份 profile 上的 `settings.mutate`。

## 决策

每个提供方 picker 始终提供 Set base URL。`baseUrlOf` 找到已存值时出现 Clear base URL。Set 复用 `LoginTextForm`（非密文）。空白草稿拒绝；settings schema 是普通字符串，TUI 不发明 URL 格式规则。Set 写入 `{ op: 'set', path: [...settingsPath, 'baseURL'] }`；Clear 对该路径 `unset`，让 catalog 端点重新生效。写入成功时，若 `describe()` 标明该命名空间要重启才生效，提示会加上 ` · restart`。模型列表和 `api` / 协议仍不走这条路径。

## 考虑过的替代方案

**按 schema 驱动的 Models 表单（模型列表、协议、compat）。** 否决：那些字段是数组和封闭联合。一个字符串字段就是密钥路径已经在用的同一种写入。

**要求 `http:` / `https:`。** 否决：`PiAiProviderProfile.baseURL` 是没有 format 的 `z.string()`。

## 后果

`/settings` → Models 可以覆盖提供方端点，而不打开 YAML。Settings file 仍只提示路径。

## 测试

`tests/settings.spec.ts` 钉住 `baseUrlOf`、`baseUrlRefusal` 和额外的 picker 行。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下经桩 `settings.mutate` 设置与取消，并在 `describe()` 报告 `applies: 'restart'` 时提示 ` · restart`。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 可写 Models](2026-08-14-tui-writable-models.md) — 该 picker 已有的密钥写入。
- [TUI 可写 display name](2026-08-14-tui-writable-display-name.md) — 同一 picker 上的标签写入。
- [TUI settings 文件路径](2026-08-14-tui-settings-file-path.md) — 说出文件的 hub 行。
