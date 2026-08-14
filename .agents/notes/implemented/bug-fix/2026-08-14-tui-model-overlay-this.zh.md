# Agent Note: `/model` 把 overlay 辅助函数留在 TUI 实例上

Status: implemented

[English](2026-08-14-tui-model-overlay-this.md) | 中文

## 问题

输入 `/model` 会让 TUI 以 `this.beginOverlayOperation is not a function` 退出（`this.beginOverlayOperation` 为 `undefined`）。命令 handler 调用 `openModelPicker` 后丢掉 Promise，抛错变成未处理拒绝，`dsh` 报 fatal load failure。

## 决策

`openModelPicker` 和 overlay 预约辅助函数（`beginOverlayOperation`、`canCommitOverlay`、`finishOverlayOperation`、`invalidateOverlayOperation`）改成实例箭头，斜杠命令和快捷键路径上的 `this` 始终是活的 `TuiApp`。`/model` handler `await` 选择器；失败是命令错误，由 transcript 提示。Ctrl+P / Alt+P 仍 fire-and-forget 同一箭头，并提示拒绝。

## 考虑过的替代方案

**继续用 TypeScript `private` / `async` 原型方法，在构造函数里 `bind`。** 否决：崩溃是跑 `/model` 的那个实例上找不到 `this.beginOverlayOperation`；实例箭头本身就是预约，而不是事后 `bind`。

**继续 `void this.openModelPicker()`。** 否决：一抛就会变成未处理拒绝并杀掉进程。handler 被 await 时，命令平面已经会提示失败。

## 后果

`/model` 打开 catalog 选择器时不再拆掉 TTY。列出或 overlay 失败留在 transcript。其它交互式斜杠命令仍使用 fire-and-forget handler，但会把异步 login、logout 和 session picker 失败转换成 transcript notice，而不是未处理拒绝。

## 测试

`packages/bundle/tui/tests/tui.spec.ts` 在 `pnpm run test:tui` 下提交 `/model`（命令平面路径）并切换当前选择。

## 相关

- [TUI 活模型目录](../feature/2026-08-14-tui-live-model-catalog.md) — 这条命令打开的选择器。
- [TUI 的 bun 运行时与 pi-ai catalog](../feature/2026-08-14-tui-omp-engine-and-catalog.md) — 从 TypeScript 加载这个类的 bun 进程。
