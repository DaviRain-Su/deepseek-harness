# Agent Note: TUI transcript chrome for compaction and feedback

Status: implemented

English | [中文](2026-08-14-tui-transcript-chrome.zh.md)

## Problem

Web paints compaction and per-message feedback as first-class chrome. The TUI transcript ignored `compaction/summary` and `feedback/record`, so a resumed session hid those log facts. Several other Web surfaces have no TUI seam: locale, Trajectory, attachments, Like/Dislike.

## Decision

`TranscriptView.applyEvent` paints a dim `compacted` row on `compaction/summary` and a dim `feedback: <text>` row on `feedback/record`. `/feedback` stays the `dsh-command-feedback` command when that plugin is mounted. Locale, Trajectory, file attachments, and Like/Dislike are documented TUI limitations, not invented chrome.

## Alternatives considered

**A second Trajectory table beside the transcript.** Rejected: the transcript is the conversation.

**Like/Dislike keybindings over `dsh-message-feedback`.** Rejected: that sidecar is Web-only; TUI does not mount it.

**A TUI locale settings namespace.** Rejected: no such namespace exists; inventing one is a product decision.

## Consequences

Resume and live append show compaction and session-level feedback in the transcript. The README lists the remaining Web-only surfaces.

## Testing

`tests/transcript.spec.ts` under `pnpm run test:tui` paints both rows. There is still no keyless assembled TUI snapshot.

## Related

- [TUI agent presets](2026-08-14-tui-agent-presets.md) — the other remaining Web-parity slice in this change.
