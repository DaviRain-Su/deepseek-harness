# Agent Note: TUI skill 斜杠补全

Status: implemented

[English](2026-08-14-tui-skill-slash-complete.md) | 中文

## 问题

OMP 在 `/` 上补全 skill 名称。dsh 已在 `agent/pre-step` 注入用户显式的 `/name` 标记（[用户显式 skill 调用](2026-08-08-user-explicit-skill-invocation.md)）。TUI 斜杠自动补全只读 `dsh-commands`，因此用户可调用的 skill 可以键入，但编辑器里发现不了。

## 决策

`SlashAutocomplete` 先读命令，再从 `ctx.skills.list()` 读用户可调用的 skill（`cwd` 来自当前 Agent header，`scope` 为该 Agent）。`isUserInvocable` 是消费方过滤器；`list()` 保持调用中立。已作为命令存在的名称不会再作为 skill 出现。缺少 `skills` 或 `list()` 失败时不返回 skill 项，命令补全仍可用。runtime 不 `inject(['skills'])`。发送 `/name` 仍走现有的 pre-step 注入。没有 `/skill` 命令。

## 考虑过的替代方案

**注册 `/skill <name>`。** 否决：[用户显式调用笔记](2026-08-08-user-explicit-skill-invocation.md) 已经否决过双 token 命令。

**使用模型过滤后的目录。** 否决：`list()` 是调用中立的；仅用户可调用的 skill 必须出现（[调用策略](2026-07-28-skill-invocation-policy.md)）。

**照抄 OMP 的文件类型斜杠 markdown 命令。** 否决：那是编辑器宏，不是 dsh skill 或命令。

**`inject(['skills'])`。** 否决：等待中的 inject 会挂起一棵永远不挂载 skills 的树，与 settings 同一类失败。

## 后果

交互式 `dsh` 可以通过键入 `/` 发现用户可调用的 skill。命令名称仍然优先。文件类型斜杠 markdown 命令不进入本目录。

## 测试

`packages/bundle/tui/tests/autocomplete.spec.ts` 钉住前缀匹配、命令名遮蔽，以及空 skill 列表。`tui.spec.ts` 在 `pnpm run test:tui` 下钉住缺少 `skills`、`isUserInvocable` 过滤、抛出的 `list()`，以及没有 Agent 时的列出。仍没有编辑器弹出层的无密钥组装 TUI 快照。

## 相关

- [用户显式 skill 调用](2026-08-08-user-explicit-skill-invocation.md) — 本目录所宣传的 pre-step `/name` 注入。
- [Skill 调用策略](2026-07-28-skill-invocation-policy.md) — 消费方的 `isUserInvocable`。
- [已交付的交互式 TUI profile](2026-08-13-shipped-tui-profile.md) — 本目录所供给的斜杠编辑器。
- [TUI 会话 picker](2026-08-14-tui-session-picker.md) — 同一 `/` 前缀还可以提供的另一份活目录。
