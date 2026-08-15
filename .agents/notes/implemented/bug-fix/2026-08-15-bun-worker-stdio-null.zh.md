# Agent Note: bun Worker stdio pipes are null

Status: implemented

[English](2026-08-15-bun-worker-stdio-null.md) | 中文

## 问题

TUI 进程跑在 bun 上。Code Mode 的 worker 运行时在 `new Worker(..., { stdout: true, stderr: true })` 之后总会执行 `worker.stdout.on('data', …)`。Node 会因此创建 pipe。bun 上这两项仍是 `null`，于是 `return "probe"` 在程序开跑前就死于 `null is not an object (evaluating 'worker.stdout.on')`。当 `DSH_TOOLS_MODE=code` 时，模型的每个工具调用都走 `run_code`，TUI 会话因此无法读文件或跑 shell。

## 决策

`listenWorkerPipes` / `drainWorkerPipes` 在 pipe 缺失时跳过。JS 层的 `console` 以及 worker 里打过补丁的 stream 写入仍走消息端口。绕过这些槽的原生写入在 bun 下不会被捕获。

## 考虑过的替代方案

**Code Mode 强制走 Node，TUI 继续用 bun。** 否决：TUI 进程是一个 bun isolate；再开一个 Node worker 监督器等于第二套运行时。

**彻底丢掉 pipe 捕获。** 否决：Node 仍会把原生写入送到这些 pipe 上，现有测试钉住了这条路径。

## 后果

TUI 的 Code Mode 会话可以在 bun 下跑 `run_code`。仅 host 侧的 `console` / 打过补丁的写入仍会出现在结果里。bun 仍然不暴露 worker stdio pipe。

## 测试

`tests/pipes.spec.ts` 钉住 null 空操作和活 pipe 排空。`tests/runtime.spec.ts` 仍走真实 Node pipe。没有 bun 组装的 `run_code` 快照。

## 相关

- [TUI OMP 引擎](../feature/2026-08-14-tui-omp-engine-and-catalog.md) — TUI 进程是 bun；本笔记覆盖该进程碰到的 worker stdio 缺口。
