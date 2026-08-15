# Agent Note: TUI Agent Hub

Status: implemented

English | [中文](2026-08-15-tui-agent-hub.zh.md)

## Problem

The per-run footer row and the subagent run card's rolling tool-call feed name that a subagent exists and what tool it last touched, but the child's own reasoning, full tool sequence, and assembled messages stay invisible. The card caps activity at six rows and folds only `tool/call` titles; concurrent delegations cannot be told apart beyond a one-line status, and there is no way to read one child's full transcript. This is the OMP-parity follow-up deferred in [TUI subagent run cards](2026-08-14-tui-subagent-run-cards.md).

## Decision

Alt+A and `/agents` open the Agent Hub, a bottom-anchored picker listing every tracked run — live and recently settled — built from `SubagentTracker.roster()` (label, provider, status, child session id). Selecting a row opens `AgentTranscriptOverlay`, a fullscreen `ScrollView` hosting a `TranscriptView` constructed with a tool lookup scoped to the child agent. The child session's existing events replay with `applyEvent(event, true)`; the app's `session/event` listener routes matching live events to `overlay.applyEvent` while the overlay is open. Escape, Ctrl+C, or Alt+A dismiss.

- `SubagentTracker` gains `roster()` and `SubagentRosterEntry`, and stores `runId`, `childSessionId`, and `stopReason` on `RunState` so settled entries carry their `subagent/end` reason.
- The child `Session` resolves through `ctx.get('agents')?.get(childId)?.session` for live runs, falling back to `ctx.get('sessions')?.get(childId)` for settled runs whose agent handle disposed; a session the store has evicted notices instead of opening.
- The overlay reuses `TranscriptView`, so it inherits the same thinking-block, Markdown, and tool-card rendering as the parent transcript. No new session events are consumed; the feature is read-only over existing signals.
- `TuiApp` gains `openAgentHub` and `openAgentTranscript`, an `agentTranscript` routing field cleared by `hideOverlay()` and the session-switch `reset()`, an Alt+A keybinding, a `/agents` command, and header hints (`alt+a agents`, `/agents`). The window title and the footer per-run row are unchanged.

## Alternatives considered

**Fold the child's reasoning and text into the run card.** Rejected: the card is a compact summary, and a second scrollable surface keeps the full transcript readable. Reusing `TranscriptView` avoids a second fold format and keeps presentation consistent with the parent.

**A `/agents` roster without a transcript overlay.** Rejected: a status-only roster duplicates the footer per-run row; the value is the full transcript dive.

**Reconstruct the hub on `--resume`.** Out of scope: the `subagent/start` / `subagent/end` pair is transient, and the hub shows runs the tracker currently holds, which `--resume` does not repopulate. Documented as a known limitation, same as the run cards.

## Consequences

New file `src/agent-hub.ts` exports `AgentTranscriptOverlay` and `showAgentTranscriptOverlay`. The hub is the OMP-parity surface the prior note deferred; that note's "Desktop notification or a `/agents` roster" alternative now points here. The footer per-run row (documented in [TUI subagent run cards](2026-08-14-tui-subagent-run-cards.md)) and the run cards remain the at-a-glance layer; the hub is the drill-in.

## Testing

`tests/subagents.spec.ts` covers `roster()` for a live run, a settled run, and after `reset()`. `tests/tui.spec.ts` covers the empty-hub notice, the picker opening with a run, the transcript overlay replaying the child log and folding a live `tool/call`, and Escape dismissal clearing the routing state.

## Known limitations and deferred work

Settled runs whose child session the store has evicted notice instead of opening. `--resume` repopulates neither the hub nor the run cards; the delegation's durable tool call and result still replay in the parent transcript.

## Related

- [TUI /sessions opens subagent children](2026-08-15-tui-sessions-subagent-children.md) — `/sessions` resumes a persisted child as the live Agent; the hub only inspects.
- [TUI subagent run cards](2026-08-14-tui-subagent-run-cards.md) — the at-a-glance layer the hub drills into.