# Agent Note: bun Worker stdio pipes are null

Status: implemented

English | [中文](2026-08-15-bun-worker-stdio-null.zh.md)

## Problem

The TUI process runs under bun. Code Mode's worker runtime always did `worker.stdout.on('data', …)` after `new Worker(..., { stdout: true, stderr: true })`. On Node those options create pipes. On bun they stay `null`, so `return "probe"` died with `null is not an object (evaluating 'worker.stdout.on')` before the program ran. With `DSH_TOOLS_MODE=code`, every model tool call goes through `run_code`, so the TUI session could not read or shell.

## Decision

`listenWorkerPipes` / `drainWorkerPipes` skip a missing pipe. JS-level `console` and the worker's patched stream writes still cross the message port. Native writes that bypass those slots are not captured under bun.

## Alternatives considered

**Force Node for Code Mode while the TUI stays on bun.** Rejected: the TUI process is one bun isolate; spawning a Node worker supervisor would be a second runtime.

**Drop pipe capture entirely.** Rejected: Node still delivers native writes on those pipes, and the existing tests pin that path.

## Consequences

A TUI Code Mode session can run `run_code` under bun. Host-only `console` / patched writes still appear in the result. bun still does not expose worker stdio pipes.

## Testing

`tests/pipes.spec.ts` pins the null no-op and live-pipe drain. `tests/runtime.spec.ts` still exercises real Node pipes. There is no bun-assembled `run_code` snapshot.

## Related

- [TUI OMP engine](../feature/2026-08-14-tui-omp-engine-and-catalog.md) — the TUI process is bun; this note covers the worker stdio gap that process hits.
