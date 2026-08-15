# Agent Note: TUI writable shell timeout

Status: implemented

English | [中文](2026-08-14-tui-writable-shell-timeout.zh.md)

## Problem

Web's Plugins bash card writes `timeoutMs` and `maxOutputBytes` on the `shell` settings namespace. TUI `/settings` already writes string and credential fields, but those two limits still required editing `settings.yaml`. Each field is one positive number the executor already asserts.

## Decision

When `describe()` lists `shell`, `/settings` inserts a Shell row after Web search. Confirming it opens Set timeout, Set output cap, and Clear for a field the user layer names. Set reuses `LoginTextForm` (not secret). A blank draft refuses; non-digits and zero refuse. The TUI does not invent a maximum — the executor's positive-finite assert is the cap. Set writes `{ op: 'set', path: [<field>], value }` as a number; Clear writes `unset` so the composition default wins. `cwd` and other shell fields stay off this path. A missing namespace omits the row so existing hub navigation does not shift.

## Alternatives considered

**A schema-driven Plugins editor (every shell and agent-loop field).** Rejected: walking `describe().schema` is the editor this TUI has already declined. Two known integers are the same write Models uses for a string.

**Timeout only.** Superseded: the output cap is the other field the Web bash card owns, and it uses the same positive-integer write.

## Consequences

`/settings` → Shell can override the foreground timeout and per-stream output cap without opening the YAML. Clear only appears for a user override, not the resolved default.

## Testing

`tests/settings.spec.ts` pins the hub row, `positiveIntRefusal`, `userNamesField`, and `shellActionRows`. `tests/tui.spec.ts` under `pnpm run test:tui` opens the row when `describe()` lists `shell` and sets and unsets `timeoutMs` and `maxOutputBytes` through stub `settings.mutate`. There is still no keyless assembled TUI snapshot.

## Related

- [TUI writable web search](2026-08-14-tui-writable-web-search.md) — the other Plugins write on this hub.
- [TUI writable agent-loop cap](2026-08-14-tui-writable-agent-loop-cap.md) — the parallel-tool integer on the same hub.
- [TUI writable base URL](2026-08-14-tui-writable-base-url.md) — the string mutate this number write copies.
- [TUI settings Models panel](2026-08-14-tui-settings-models-panel.md) — the hub this row sits on.
