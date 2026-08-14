# Agent Note: TUI file themes

Status: implemented

English | [中文](2026-08-14-tui-file-themes.zh.md)

## Problem

`/theme` only switched four in-memory palettes. The pick died on restart, the overlay showed raw ids, and there was no way to drop in a custom color file. oh-my-pi ships file themes users already have; copying colors by hand into the TUI source is not a product path.

## Decision

The TUI owns a `tui-theme` settings namespace (`theme`, default `dark`) through `installSettingsSection`, the same optional-settings pattern as `agent-default-model`. Composition config `theme` is the base layer; a settings provider overlays the last `/theme` pick. Registration runs when `ctx.settings` is already present at apply, or after Loader settlement; a missing provider keeps the composition default and does not wait on `inject(['settings'])`.

Custom palettes are `$DSH_HOME/themes/<id>.json` (`dshHomePath('themes')`). A missing directory is an empty catalog. Builtin ids win on collision. The stem must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`. Parse accepts a flat palette object or an oh-my-pi document (`colors` plus optional `vars`); extra keys are ignored; `toolDiffAdded` / `toolDiffRemoved` alias `diffAdd` / `diffDel`; values are `#rgb` / `#rrggbb`, a 256-color index, a var name, or `""` (terminal default). Nested vars detect cycles. This package does not vendor oh-my-pi's bundled default JSON files.

The picker labels builtins Dark / Tokyo Night / Catppuccin / Light and marks custom rows `custom`. Apply mutates the live `TUI_COLOR` object, invalidates the transcript container, `requestRender`s, and `settings.replace`s the id. An unreadable or invalid selected file notices and does not switch. An unknown saved id at startup notices and keeps the live palette (initially `dark`). `themeInternals.themesDir` is the test hook so a real `$DSH_HOME/themes` cannot pollute `listTuiThemes()`.

Web `ui-theme` (`preference: light|dark|system`) stays a different token set.

## Alternatives considered

**Vendor oh-my-pi's ~80 default JSON files.** Rejected because the four builtins already cover the shipped chrome, and `$DSH_HOME/themes` is how a user brings an OMP file they already have.

**Watch the themes directory and `settings.yaml`.** Rejected for v1; the picker re-reads files when opened, and a selected JSON is not re-parsed until the next apply.

**OSC 11 auto dark/light, nerd/ascii symbol packs, syntax-highlight tokens, OMP status-line tokens.** Deferred; they are not this palette.

**Reuse Web `ui-theme`.** Rejected because TUI tokens (tool cards, diffs, Markdown chrome) are not `light|dark|system`.

**Silent fallback from a broken selected file to `dark`.** Rejected; misconfiguration must fail with a notice.

## Consequences

Dropping an oh-my-pi theme JSON into `$DSH_HOME/themes/` and picking it in `/theme` paints chrome, bubbles, Markdown, tool cards, and diffs. Restart restores the id when a settings provider is mounted. Keys the TUI does not paint are ignored, so an OMP file can still miss a required TUI token and refuse to apply. There is no live reload and no bundled OMP default pack.

## Testing

`tests/theme.spec.ts` stubs `themeInternals.themesDir`, pins builtins, custom listing and collision, OMP `vars` / 256 / empty / aliases, invalid JSON, cycles, and `fg('')`. `tests/tui.spec.ts` pins Config `{ theme: 'dark' }`, restore from a fake settings section, persist of the next pick, and an unknown saved id notice. There is still no keyless assembled TUI snapshot.

## Related

- [TUI bun runtime and pi-ai catalog](2026-08-14-tui-omp-engine-and-catalog.md) — builtin palettes and OMP chrome adapters; this note owns file load and persistence.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the bundle this picker ships on.
