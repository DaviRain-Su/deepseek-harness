# Agent Note: TUI /export 写入本地 JSONL

Status: implemented

[English](2026-08-15-tui-export-jsonl.md) | 中文

## 问题

Web 的 `/export` 经 [`dsh-session-log-export`](../../../../packages/session-query/session-log-export/README.md) 下载 Host 流式 ZIP。TUI 不挂 Host，也没有浏览器下载管理器，因此没有这条命令。调试工件仍然需要把持久化的原始日志带出进程。

## 决策

`/export [path]` 先 flush 活会话，再把 `ctx.sessionPersistence.readRaw` 写到本地文件。空参数使用进程 cwd 下的 `dsh-session-<经消毒的 id>.jsonl`。给出的参数相对该 cwd 解析，或作为绝对路径使用。写入的字节是后端解码后的工件文本，不是从已解析事件重建的。正在运行的一轮可以导出。缺少 `ctx.sessionPersistence`、`supportsRawArtifacts === false`、工件缺失、flush 失败和写入失败都会提示。

这不是 Web 的 ZIP：没有子孙会话、没有附件、没有压缩、没有 HTTP。[Web `/export` 共用流式 Session ZIP 下载](2026-08-11-web-export-command-and-dialog.md) 为浏览器否决了 Host 路径写入；TUI 的进程 cwd 是有意义的目的地。

`/export` 不进页眉快捷键。`/help` 会列出它。

## 考虑过的替代方案

**挂上 `dsh-session-log-export` 并打 Host ZIP 端点。** 否决：TUI profile 不挂 Host 或 HTTP server。

**在进程内写出含子孙会话和附件的 ZIP。** 本切片否决：TUI 需要一份用户能附在报告上的本地文件；ZIP 树仍留在 Host 下载。

**从 `session.events` 重建 JSONL。** 否决：`readRaw` 才是逐字的持久化工件；折叠会丢掉 packed-chunk 行和键顺序。

## 后果

TUI 对话可以把持久化日志写到启动 cwd 旁边，或写到显式路径，而不需要浏览器。SQLite 和其他没有原始工件的后端会提示。subagent 子会话在 `/sessions` 切过去之后，仍是各自的 `/export` 目标。

## 测试

`tests/export.spec.ts` 钉住消毒后的默认文件名和相对 cwd 的解析。`tests/tui.spec.ts` 在 `pnpm run test:tui` 下于 `/help` 列出 `/export`、缺少持久化服务时提示、不支持的后端和缺失工件时提示，再把桩 `readRaw` 正文写到临时路径。仍没有无密钥的组装 TUI 快照。

## 相关

- [Web 会话日志导出为 Host 流式 ZIP 下载](2026-08-10-web-session-log-export.md) — 本命令不调用的 Host ZIP。
- [Web `/export` 共用流式 Session ZIP 下载](2026-08-11-web-export-command-and-dialog.md) — Web 命令拒绝路径的原因。
- [TUI /sessions 打开 subagent 子会话](2026-08-15-tui-sessions-subagent-children.md) — 切到子会话后再 `/export` 该子会话的工件。
