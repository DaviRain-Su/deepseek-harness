# Agent Note: TUI agent presets

Status: implemented

English | [中文](2026-08-14-tui-agent-presets.zh.md)

## Problem

Web composes each session from [`dsh-agent-presets`](../../../../packages/preset/agent-presets/README.md). TUI kept model-facing tools on the host plane and never mounted a roster, so `/preset` could not exist and a TUI session could not share Web's standing compositions.

## Decision

The TUI patch inserts `agent-presets` with `default: standard` and disables the same host-plane tool rows Web disables, so a session does not see both copies. `apps/cli`'s `composeProfile` still patches the shipped root when the row exists. `tui-runtime` resolves the default before `agents.create` so `meta.agentPreset` is snapshotted, mounts in `setup`, and on resume mounts `resolveSessionPreset(session)`. `/preset` lists the roster, recomposes a blank session, and appends `agent-preset/selected`. A `turn/start` locks the composition. Missing `ctx.agentPresets` notices and leaves the host composition. Subagent children still use `composeFrom()`, never a second `mount()` by id. The footer shows `preset <id>` when `composedPreset` answers.

## Alternatives considered

**Mount the roster without disabling host tools.** Rejected: the agent would see both the base registrations and the standing mount.

**A two-step workspace-style preset authoring UI.** Rejected: copy/delete stay on the Web General page; TUI only selects.

**Allow `/preset` after the first turn.** Rejected: `recompose` does not read history; swapping tools mid-conversation would leave logged calls the new composition cannot make. The caller owns the blank check, same as the Web select path.

## Consequences

A shipped `dsh` TUI session runs on `standard` unless the log records another preset. A rosterless overlay that removes the `agent-presets` row must also drop the host-plane disables, or the session has no tools. The [shipped TUI profile](2026-08-13-shipped-tui-profile.md) no longer keeps tools on the host plane.

## Testing

`tests/presets.spec.ts` pins `sessionBlank` and `presetPickerItem`. `tests/tui.spec.ts` under `pnpm run test:tui` notices a missing roster, mounts `standard` on create, recomposes `/preset code`, and locks after `turn/start`. There is still no keyless assembled TUI snapshot.

## Related

- [Shipped TUI profile](2026-08-13-shipped-tui-profile.md) — the host-plane tools sentence this note updates.
- [TUI session status chips](2026-08-14-tui-session-status-chips.md) — the footer chip row that now includes `preset`.
