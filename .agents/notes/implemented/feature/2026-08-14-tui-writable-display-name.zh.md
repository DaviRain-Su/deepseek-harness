# Agent Note: TUI writable display name

Status: implemented

[English](2026-08-14-tui-writable-display-name.md) | 中文

## 问题

[可写 Models](2026-08-14-tui-writable-models.md) 的 picker 能存密钥和 [base URL](2026-08-14-tui-writable-base-url.md)，却不能存 `displayName`。自定义网关标签仍要手改 `settings.yaml`。该字段是普通字符串，和已有写入走同一份嵌套 profile 上的 `settings.mutate`。

## 决策

`settingsPath` 非空时出现 Set display name——嵌套提供方 profile，也就是 `llm-pi-ai` 存放 `displayName` 的位置。`displayNameOf` 找到已存值时出现 Clear display name。Set 复用 `LoginTextForm`（非密文）。空白草稿拒绝；`llm-pi-ai` 拒绝空的 `displayName`，TUI 不发明格式规则。Set 写入 `{ op: 'set', path: [...settingsPath, 'displayName'] }`；Clear 对该路径 `unset`，让路由 id 重新生效。写入成功时，若 `describe()` 标明该命名空间要重启才生效，提示会加上 ` · restart`。DeepSeek 官方这类分节根 profile 没有 `displayName` 字段，因此不出现这两行。模型列表和 `api` / 协议仍不走这条路径。

## 考虑过的替代方案

**每个可配置提供方都提供这两行。** 否决：`llm-deepseek` 没有 `displayName`，默认 Models 行上的 mutate 会失败。

**遍历 `describe().schema` 判断字段是否存在。** 否决：那是按 schema 驱动编辑器的起点。

## 后果

`/settings` → Models 可以给嵌套提供方改名，而不打开 YAML。官方 DeepSeek 行仍没有标签写入。

## 测试

`tests/settings.spec.ts` 钉住 `displayNameOf`、`displayNameRefusal` 和额外的 picker 行。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下经桩 `settings.mutate` 设置与取消。仍没有无密钥的组装 TUI 快照。

## 相关

- [TUI 可写 Models](2026-08-14-tui-writable-models.md) — 该 picker 已有的密钥写入。
- [TUI 可写 base URL](2026-08-14-tui-writable-base-url.md) — 同一 picker 上的端点写入。
