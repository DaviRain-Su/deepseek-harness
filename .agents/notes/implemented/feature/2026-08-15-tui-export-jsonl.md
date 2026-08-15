# Agent Note: TUI /export writes a local JSONL

Status: implemented

English | [中文](2026-08-15-tui-export-jsonl.zh.md)

## Problem

Web `/export` downloads a host-streamed ZIP through [`dsh-session-log-export`](../../../../packages/session-query/session-log-export/README.md). The TUI mounts no Host and no browser download manager, so that command is absent. A debugging artifact still needs to leave the process as the durable raw log.

## Decision

`/export [path]` flushes the live session, then writes `ctx.sessionPersistence.readRaw` to a local file. An empty argument uses `dsh-session-<sanitized-id>.jsonl` in the process cwd. A supplied argument is resolved against that cwd, or used as an absolute path. The written bytes are the backend's decoded artifact text, not a reconstruction from parsed events. A running turn may export. Missing `ctx.sessionPersistence`, `supportsRawArtifacts === false`, a missing artifact, flush failure, and write failure each notice.

This is not the Web ZIP: no descendants, no attachments, no compression, no HTTP. [Web `/export` shares the streamed Session ZIP download](2026-08-11-web-export-command-and-dialog.md) rejected a Host-path writer for the browser; the TUI process cwd is a meaningful destination.

`/export` stays off the header hints. `/help` lists it.

## Alternatives considered

**Mount `dsh-session-log-export` and hit the Host ZIP endpoint.** Rejected: the TUI profile mounts no Host or HTTP server.

**Write a ZIP of descendants and attachments in-process.** Rejected this slice: the TUI needs a single local file the user can attach to a report; the ZIP tree stays on the Host download.

**Reconstruct JSONL from `session.events`.** Rejected: `readRaw` is the verbatim durable artifact; a fold would drop packed-chunk rows and key order.

## Consequences

A TUI conversation can drop its durable log next to the launch cwd, or at an explicit path, without a browser. SQLite and other backends without raw artifacts notice. Subagent children remain separate `/export` targets after `/sessions` switches to them.

## Testing

`tests/export.spec.ts` pins the sanitized default filename and cwd-relative resolve. `tests/tui.spec.ts` under `pnpm run test:tui` lists `/export` on `/help`, notices a missing persistence service, an unsupported backend, and a missing artifact, then writes a stub `readRaw` body to a temp path. There is still no keyless assembled TUI snapshot.

## Related

- [Web session-log export as a host-streamed ZIP download](2026-08-10-web-session-log-export.md) — the Host ZIP this command does not call.
- [Web `/export` shares the streamed Session ZIP download](2026-08-11-web-export-command-and-dialog.md) — why the Web command refuses a path.
- [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md) — switch to a child, then `/export` that child's artifact.
