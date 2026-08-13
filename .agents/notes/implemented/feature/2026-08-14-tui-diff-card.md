# Agent Note: TUI diff card — expand, overlay, and exact changed rows

Status: implemented

English | [中文](2026-08-14-tui-diff-card.zh.md)

## Problem

`write`, `edit`, and `str_replace_editor` declare `card: 'diff'` with `FileDiff[]` ([render-intent union](../architecture/2026-07-02-tool-render-intent-union.md)). The Web client already paints those hunks in [`DiffBlock`](../../../packages/client/ui-primitives/src/DiffBlock.tsx). The shipped TUI mapped the same view to the file path only, so an Editor mutation was a title with no visible change. There was no expand/collapse and no way to open the complete diff.

## Decision

`@deepseek-ai/dsh-tui` paints `card: 'diff'` as a single-column card: a path header per hunk, then `+`/`-`/`  ` rows, then a dim `└ +A -R · N file(s)` footer. Added and removed counts are exact changed rows when a bounded LCS of the two sides finishes (`oldLen * newLen ≤ 12_000` cells). A larger hunk falls back to the whole old side then the whole new side and appends ` ≈` to the footer. Empty text is zero lines; a trailing newline terminates the last line. Distinct paths feed the file count, matching [the Web diff card](2026-07-30-web-diff-card.md). Diff body lines truncate to the card width rather than wrap, so indentation stays aligned.

The collapsed card shows 8 body rows as a head/tail split with `… N more · ctrl+o expand · alt+o open` between them. Ctrl+O toggles expand/collapse on the most recent tool card. Alt+O opens the most recent diff card in a fullscreen overlay (`tui.showOverlay({ fullscreen: true })`) whose mouse tracking lets the wheel scroll; Escape / Ctrl+O / Alt+O dismiss it. pi-tui enables pointer reports only on that fullscreen overlay, so the main transcript keeps native selection.

## Alternatives considered

**Whole-side rows only, like Web `DiffBlock`.** Rejected because result-time hunks from `packages/fs/tool-fs/src/diff.ts` already carry three lines of context on both sides; an LCS turns those into neutral `  ` rows and reports exact changed counts, which the Web note already documented as the TUI's job.

**Always-on mouse tracking on the main transcript.** Rejected because `@oh-my-pi/pi-tui` turns SGR mouse reporting on only while a fullscreen overlay holds the alternate screen. Enabling it for the session would steal native selection and scrollback. Alt+O is the click-to-open path: the overlay is the pointer surface.

**Open `$EDITOR` or an OSC 8 file link on the path.** Rejected because the missing behavior is seeing the applied change, not the file after the write. The overlay is the diff.

**Restore the deleted ui-group TUI renderer.** Rejected because [shipped-tui-profile](2026-08-13-shipped-tui-profile.md) reintroduced the terminal as a new bundle; this paints `FileDiff` on that bundle rather than inheriting the removed tree.

## Consequences

An Editor `str_replace` / `create`, or a `write`/`edit`, shows the change inline. Long diffs stay an 8-row preview until Ctrl+O or Alt+O. The overlay is the only TUI surface that receives mouse wheel events. Call-time diffs still have `oldText: null` for creates and overwrites, so those cards are added-only until `presentResult` replaces them with applied hunks.

## Testing

`packages/bundle/tui/tests/diff.spec.ts` pins the terminator rule, LCS changed rows, leading insert/delete, distinct-path footer, empty diffs, the comparison-cell fallback, and per-kind paint. `tools.spec.ts` pins `linesForCall`/`linesForResult` bodies, collapsed/expanded diff cards, and `diffView`. `diff-overlay.spec.ts` pins scroll keys, wheel reports, and dismiss. `transcript.spec.ts` pins last-card expand and last-diff lookup. `tui.spec.ts` types Ctrl+O / Alt+O through a FakeTerminal session. `pnpm run test:tui` is the package gate.

## Related

- [Web diff card](2026-07-30-web-diff-card.md) — the browser consumer of the same `FileDiff` intent; this note is the TUI consumer.
- [Shipped interactive TUI profile](2026-08-13-shipped-tui-profile.md) — the bundle this paints on.
- [Tagged render-intent union](../architecture/2026-07-02-tool-render-intent-union.md) — `card: 'diff'`.
