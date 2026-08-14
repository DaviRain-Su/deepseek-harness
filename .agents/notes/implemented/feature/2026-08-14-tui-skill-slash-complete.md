# Agent Note: TUI skill slash complete

Status: implemented

English | [中文](2026-08-14-tui-skill-slash-complete.zh.md)

## Problem

OMP completes skill names on `/`. dsh already injects user-explicit `/name` tokens at `agent/pre-step` ([user-explicit skill invocation](2026-08-08-user-explicit-skill-invocation.md)). TUI slash autocomplete read `dsh-commands` only, so a user-invocable skill was typeable but not discoverable in the editor.

## Decision

`SlashAutocomplete` reads commands first, then user-invocable skills from `ctx.skills.list()` (`cwd` from the live Agent header, `scope` the Agent). `isUserInvocable` is the consumer filter; `list()` stays invocation-neutral. A name that exists as a command is never also offered as a skill. Missing `skills` or a failed `list()` returns no skill items so command completions still work. The runtime does not `inject(['skills'])`. Submit sends a `/name` that is not a registered command but lists as user-invocable as a user message, so `dsh-tool-skill` can inject at pre-step; a miss still notices `unknown command`. There is no `/skill` command.

## Alternatives considered

**Register `/skill <name>`.** Rejected: the [user-explicit invocation note](2026-08-08-user-explicit-skill-invocation.md) already rejected a two-token command.

**Use a model-filtered catalog.** Rejected: `list()` is invocation-neutral; user-only skills must appear ([invocation policy](2026-07-28-skill-invocation-policy.md)).

**Copy OMP file-type slash markdown commands.** Rejected: those are editor macros, not dsh skills or commands.

**`inject(['skills'])`.** Rejected: a waiting inject hangs a tree that never mounts skills, the same failure as settings.

## Consequences

Interactive `dsh` can discover user-invocable skills by typing `/` and invoke them by submitting `/name`. Command names still win. File-type slash markdown commands stay out of this catalog.

## Testing

`packages/bundle/tui/tests/autocomplete.spec.ts` pins prefix match, command-name shadowing, and an empty skill list. `tui.spec.ts` under `pnpm run test:tui` pins missing `skills`, the `isUserInvocable` filter, a thrown `list()`, listing without an Agent, and submitting `/name` as a user message. There is still no keyless assembled TUI snapshot of the editor popup.

## Related

- [User-explicit skill invocation](2026-08-08-user-explicit-skill-invocation.md) — the pre-step `/name` injection this catalog advertises.
- [Skill invocation policy](2026-07-28-skill-invocation-policy.md) — `isUserInvocable` at the consumer.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the slash editor this catalog feeds.
- [TUI session picker](2026-08-14-tui-session-picker.md) — another live catalog the same `/` prefix can offer.
