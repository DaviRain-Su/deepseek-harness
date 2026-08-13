# Agent Note: TUI subagent run cards

Status: implemented

English | [中文](2026-08-14-tui-subagent-run-cards.zh.md)

## Problem

The TUI rendered subagent work invisibly. `TranscriptView` folded only the parent session's user/assistant/tool events, and the app's `session/event` listener discarded every other session, so a delegation appeared as a generic pending tool card with raw JSON args and stayed mute until the parent's `tool/result` arrived — no sign the child existed, what it was doing, or how it ended. The signals already existed: the transient scoped `subagent/start` / `subagent/end` lifecycle pair carries provider, child session id, and terminal stop reason; the child session's own durable events, including its `subagent/descriptor` creation label, broadcast through `session/event`. This extends the TUI shipped in [shipped-tui-profile](2026-08-13-shipped-tui-profile.md) and [tui-omp-engine-and-catalog](2026-08-14-tui-omp-engine-and-catalog.md).

## Decision

One live card per run, owned by `SubagentTracker` ([`src/subagents.ts`](../../../../packages/bundle/tui/src/subagents.ts)) and appended chronologically to the transcript container.

- `subagent/start` opens a pending `ToolCard` titled `⏵ subagent · <provider>`; the child log's `subagent/descriptor` event swaps in its durable `label` once appended.
- The tracker keys runs by child session id and folds the child log's `tool/call` into a rolling six-row activity feed, presented through the same fallback chain as the parent transcript (`presentToolCall`, now exported from `transcript.ts`, resolves the tool definition against the live child agent when `ctx.agents` still holds it). A failing `tool/result` appends `✗ <tool> failed`.
- `subagent/end` settles the card: the title gains `— <stopReason>`, the body keeps the activity tail plus a `<n> tool calls · <reason>` summary, and a non-`completed` reason paints the error background. `ToolCard` gains `update(title, body)` for this in-place pending progress.
- `SessionFooter.setSubagents` adds `<n> subagents running` to the stats row; zero hides it. The same label drives the window title (`dsh` when idle, `dsh · <n> subagent(s) running` while live) and `setProgress`. A `subagent/end` that actually settles a live run writes C0 BEL (`\a`); duplicate and unknown ends stay silent. Teardown restores the idle title and clears progress before `tui.stop()`.
- `TuiApp` listens to `subagent/start` / `subagent/end` unscoped — the same pattern as `hooks-claude-code` — and routes `session/event` from non-parent sessions to the tracker. Nested delegations render flat beside their parent's siblings rather than under the parent's card.

## Alternatives considered

**Fold progress into the delegation's tool card.** Rejected because nothing durably correlates the parent's `tool/call` with the child run until the `tool/result` carries `runId`, and a background delegation settles its call immediately while the run keeps going. A separate card covers foreground and background runs uniformly.

**Reconstruct run cards on `--resume`.** Rejected because the lifecycle pair is transient and the child's activity lives in the child's own log, which the parent session never loads. Documented in the package README as a known limitation; the delegation's durable tool call and result still replay.

**Render the child's final output in the card.** Rejected because the parent's `tool/result` card already carries the full report; the run card keeps the stop reason and counts instead.

**Desktop notification or a `/agents` roster.** Deferred. oh-my-pi has neither a terminal bell nor a desktop notify on subagent completion; its answer is the Alt+A Agent Hub. The shipped reminder is the engine's existing `setTitle` / `setProgress` plus a C0 BEL. A fullscreen roster remains the OMP-parity follow-up.

## Consequences

`@deepseek-ai/dsh-tui` gains a peer+dev dependency on `@deepseek-ai/dsh-subagent` for its types and the `SessionEventMap` merge only; every import is type-only, so the bun bundle never loads the service's zod tree. Package tests under bun cannot import `dsh-subagent` runtime values — vite's resolver cannot reach its zod dependency from this package — so tests cast the run-id brand and keep the descriptor format version literal. The pre-existing keyless-snapshot gap for the assembled TUI is unchanged: presentation stays the package semantic matrix under `pnpm run test:tui`.

## Testing

`tests/subagents.spec.ts` (bun) covers card open/settle with footer counts, descriptor labelling, activity folding with tool presentation, failing-result lines, window rolling with an earlier-count, foreign-session rejection, and duplicate/unknown lifecycle edges — including that `end()` returns whether a run actually settled. An app-level case in `tests/tui.spec.ts` emits the lifecycle pair and child appends through the real `SessionStore` dispatch and asserts the footer count, running/idle window title, progress flag, BEL in the captured write stream, and rendered card text.
