# Agent Note: TUI writable agent-loop cap

Status: implemented

English | [中文](2026-08-14-tui-writable-agent-loop-cap.zh.md)

## Problem

Web's Plugins agent-loop card writes `maxParallelToolCalls` on the `agent-loop` settings namespace. That field is the whole user-owned section. TUI `/settings` already writes the two shell integers, but the parallel-tool cap still required editing `settings.yaml`.

## Decision

When `describe()` lists `agent-loop`, `/settings` inserts an Agent loop row after Shell. Confirming it opens Set parallel cap and, when the user layer names `maxParallelToolCalls`, Clear parallel cap. The write reuses the Shell positive-integer form and `settings.mutate`. The composed `agents` array stays off this path — it is consumed once at service start. A missing namespace omits the row so existing hub navigation does not shift.

## Alternatives considered

**Fold the cap into the Shell picker.** Rejected: it lives on a different namespace and a different Web card.

**A schema-driven Plugins editor.** Rejected: this section has one user-owned field; walking schema is still the declined editor.

## Consequences

`/settings` → Agent loop can cap the next tool group without opening the YAML. Clear only appears for a user override.

## Testing

`tests/settings.spec.ts` pins the hub row and `agentLoopActionRows`. `tests/tui.spec.ts` under `pnpm run test:tui` opens the row when `describe()` lists `agent-loop` and sets and unsets `maxParallelToolCalls` through stub `settings.mutate`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable shell timeout](2026-08-14-tui-writable-shell-timeout.md) — the integer write this path copies.
- [TUI writable web search](2026-08-14-tui-writable-web-search.md) — the other Plugins write on this hub.
- [TUI settings Models panel](2026-08-14-tui-settings-models-panel.md) — the hub this row sits on.
