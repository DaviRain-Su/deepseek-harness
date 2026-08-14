# Agent Note: TUI approval overlay

Status: implemented

English | [中文](2026-08-14-tui-approval-overlay.zh.md)

## Problem

The shipped TUI mounted `dsh-user-approval` through base (`workspace-write` + `ask`) but registered no `approval/request` answerer. Bash escalation and `tools/pre-execute` `ask` decisions therefore settled `unavailable` and the tool call denied. Web already answers through mux frames; the TUI README named the missing overlay as the gap that kept the terminal from being a daily default.

## Decision

`tui-runtime` registers one terminal answerer after the TTY starts. The listener answers only when `req.agent` is this session's agent and otherwise calls `next()`. The overlay reuses `OverlayPicker`: title `Allow <toolName>?`, rows `Allow once` / `Reject` (the same one-shot pair ACP advertises), hint the asker's `reason` or a one-call-only fallback. Enter on the first row is `allowed-once`; the second row is `rejected`; Escape, an abort signal, hiding the overlay, or quitting settles `cancelled`. An already-aborted signal does not open.

The runtime injects `approval` so a tree without the seam fails to activate. It does not add `allow-always`, a grant store, or a `/permission` command; session policy stays `ask` / `never` through `dsh-permission-presets`.

## Alternatives considered

**Route approval through `dsh-user-questions`.** Rejected because the approval seam already owns the closed outcome, audit pair, and fail-closed default; a question-form adapter would invent a second mapping and lose `cancelled` vs `unavailable`.

**Require `callId` the way ACP does.** Rejected because the TUI can present `toolName` and `reason` without attaching to a streamed card; hook and escalation asks sometimes arrive without a call id.

**Auto-allow under `workspace-write`.** Rejected because that would delete the `ask` policy the preset already selected.

## Consequences

Interactive `dsh` can grant or refuse one tool call from the terminal. A host without this answerer still fails closed. Installed and source TUI share the same listener; headless and web keep their own channels.

## Testing

`packages/bundle/tui/tests/approval.spec.ts` drives the picker through a fake overlay: Allow once, Reject, Escape, pre-aborted and live abort, external hide, and foreign-agent `next()`. `tui.spec.ts` boots a FakeTerminal session, opens a turn, calls `ctx.approval.request`, and confirms Enter settles `allowed-once`. There is still no keyless assembled TUI snapshot; presentation remains the package semantic matrix.

## Related

- [The approval seam](2026-07-06-approval-seam.md) — outcome vocabulary, audit pair, and fail-closed default this overlay answers.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the composition that now includes this channel.
