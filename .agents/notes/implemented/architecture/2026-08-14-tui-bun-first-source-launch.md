# Agent Note: TUI source launch starts on bun

Status: implemented

English | [中文](2026-08-14-tui-bun-first-source-launch.zh.md)

## Problem

Interactive `pnpm dsh` paid a Node+tsx hop before the tui profile could `exec` bun. tsx's ESM hook exists so web and headless can load the non-erasable vendored graph on Node; the tui process does not need it, because bun loads that same TypeScript natively. The hop doubled startup and kept the TTY path on the runtime the OMP engine does not use.

## Decision

The root `dsh` script runs `node apps/cli/src/dsh-launch.mjs`. That file is plain ESM: it classifies argv without tsx, then `exec`s `bun apps/cli/src/bin.ts` when the mode may take bun, or `node --import tsx/esm apps/cli/src/bin.ts` otherwise. Tui is required: missing bun >= 1.3.14 exits 1 before `bin.ts` loads. Headless and `login` / `logout` / `auth` take bun when PATH has one; Node+tsx remains the fallback so Node-only CI still boots. Launcher `--help` / `--version`, `--dump-config` / `--dump-default-config`, `web`, and `plugin` stay on Node+tsx.

`reexecTuiUnderBun` remains the fallback when `bin.ts` is reached under Node (installed `lib/bin.js`, or a direct `node --import tsx/esm` invocation). Under the source tui path it is a no-op because the process is already bun. Installed headless and login stay on Node.

This does not vendor `@oh-my-pi/pi-natives` as the harness core, does not replace `landlock-run`, and does not change `engines.node`, pnpm, or the Node CI matrix. Web keeps the [tsx source-launch contract](2026-07-29-dsh-source-launch-tsx-esm.md).

## Alternatives considered

**Point `pnpm dsh` at `bun apps/cli/src/bin.ts` for every mode.** Rejected because web, HMR (`loader.internal`), and the Node compatibility smoke still require the tsx vector.

**Keep classifying inside `bin.ts` after tsx loads.** Rejected because the cost to delete is the tsx hop itself.

**Published `bin` shebang becomes bun.** Rejected because `dsh web` must start on a host that has Node and no bun.

## Consequences

`pnpm dsh` and `pnpm dsh --resume <id>` start the TUI under bun without Node+tsx. A host without bun >= 1.3.14 still exits 1 naming [https://bun.sh](https://bun.sh) before `bin.ts` loads. `pnpm dsh --profile headless` and `pnpm dsh auth` use bun when PATH has bun >= 1.3.14, otherwise Node+tsx. `pnpm dsh web` stays on Node+tsx. The installed CLI still starts as Node and re-execs bun only for tui.

## Testing

`apps/cli/tests/tui-hot-path.spec.ts` pins the classifier against `parseDshArgs` for boots that do not print-and-exit. `source-launch.compat.spec.ts` runs the production `dsh-launch.mjs` vector: non-TTY tui failure or missing-bun, launcher `--help` on Node+tsx, keyless headless usage/help, empty-home `auth`, and the `node --import tsx/esm bin.ts` fallback. `bun-reexec.spec.ts` still pins the version floor.

## Related

- [TUI bun runtime and pi-ai catalog](../feature/2026-08-14-tui-omp-engine-and-catalog.md) — why the tui process needs bun; this note owns the source hop.
- [dsh source launch through the tsx ESM hook](2026-07-29-dsh-source-launch-tsx-esm.md) — the Node+tsx vector web still uses, and headless/login fall back to.
