# Agent Note: TUI bun runtime and pi-ai catalog

Status: implemented

English | [中文](2026-08-14-tui-omp-engine-and-catalog.zh.md)

## Problem

The shipped interactive TUI ran under Node on [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui). That engine has no rounded-box `symbols`, no editor `hintStyle`, and a thinner theme adapter than [`@oh-my-pi/pi-tui`](https://www.npmjs.com/package/@oh-my-pi/pi-tui), which declares `engines.bun >= 1.3.14` and uses `Bun.stringWidth` / `bun:ffi`. The session had no `/model` picker, and the transcript dropped `reasoning-delta` chunks so thinking never appeared.

## Decision

The TUI **process** runs on bun. Source `pnpm dsh` classifies argv in [`dsh-launch.mjs`](../../../../apps/cli/src/dsh-launch.mjs) and `exec`s bun for a tui boot ([bun-first source launch](../architecture/2026-08-14-tui-bun-first-source-launch.md)). The Node `dsh` launcher, after `parseDshArgs` selects profile `tui`, `exec`s the same entry and argv under `bun` when `process.versions.bun` is unset. Missing or older-than-1.3.14 bun exits 1 naming [https://bun.sh](https://bun.sh). Installed web, headless, dump-config, plugin, and launcher `--help` stay on Node; source headless and login take bun when PATH has one.

`@deepseek-ai/dsh-tui` depends on `@oh-my-pi/pi-tui` (and its `@oh-my-pi/pi-natives` tree). Host `tsc` consumes that package's `.d.ts`; tsdown externalizes `@oh-my-pi/*` so the host bundle never loads `bun:ffi`. Node Vitest excludes `packages/bundle/tui`; `pnpm run test:tui` runs those tests under bun. The coverage CI job installs bun and runs that script.

Chrome adapters follow OMP `getEditorTheme` / `getMarkdownTheme` / `getSelectListTheme` / `getSymbolTheme`: rounded box symbols, muted editor border, `hintStyle`, user-message `Box`, Markdown assistant blocks, tool-card backgrounds. Built-in palettes are Pi `dark` plus OMP token copies `dark-tokyo-night`, `dark-catppuccin`, and `light`. File themes, persistence, and the `/theme` catalog live in [TUI file themes](2026-08-14-tui-file-themes.md). This still does not ship OMP's theme watcher, mermaid ASCII, native highlight FFI, or the bundled OMP default JSON pack. pi-tui top-aligns a frame shorter than the TTY, so `SessionChrome` inserts empty rows between the transcript and the editor until the transcript fills the viewport. `reasoning-delta` chunks and assembled `reasoning` blocks render as a dim italic Thinking body ahead of the Markdown answer.

`dsh-llm-pi-ai` gains `enableInstalledCatalog` (default `false`). When true, every `catalogProviderIds()` entry that `catalogProviderTakesApiKey` accepts is registered as a route with no `apiKeyEnv`, so pi-ai ambient discovery (`OPENAI_API_KEY` and siblings) applies; explicit `providers` entries override the matching stub. Shipped compositions leave the flag off. Plugin apply still auto-registers catalog providers whose ambient API-key env vars are already set (skipping catalog `deepseek`, which would duplicate `deepseek-official`), plus `ollama-cloud` when `OLLAMA_API_KEY` is set — hosted Ollama Cloud at `https://ollama.com/v1`, which pi-ai does not ship. `/model` (and Ctrl+P / Alt+P) lists registered `ctx.llm.listProviders()` × `listModels()` routes — DeepSeek official, settings-configured pi-ai profiles, those ambient catalog routes, and Ollama Cloud — writes `ModelSelectionRef.current`, calls `agentDefaultModel.saveSelection()`, and updates the footer. `ollama-cloud` `listModels` interrogates `GET /v1/models` and still resolves an id the seed catalog does not name.

This supersedes the rejected `@oh-my-pi/pi-tui` alternative in [shipped-tui-profile](2026-08-13-shipped-tui-profile.md) for the TUI process only. The whole repository's `packageManager`, Vitest, web, and CI Node matrix stay pnpm/Node.

## Alternatives considered

**Convert the whole repository to bun.** Rejected because it would replace the [tsx source-launch contract](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md), `engines.node`, and the Windows wine gate. Only the TUI process needs bun APIs.

**Vendor the oh-my-pi coding-agent.** Rejected because that tree is a second product (Rust `pi-natives` core, 60+ providers, 31 tools, advisor/memory, OAuth, Agent Hub). dsh stays a Cordis plugin tree with DeepSeek as the official adapter.

**Depend on `@oh-my-pi/pi-catalog`.** Rejected because `dsh-llm-pi-ai` already materializes `@earendil-works/pi-ai` `getBuiltinProviders()` through `catalogProviderIds()`. A second catalog would duplicate route ids and auth policy.

**Seed a static Ollama Cloud model list.** Rejected because Ollama retires Cloud models on a published schedule; `/model` would offer ids the endpoint no longer serves. Live `GET /v1/models` with a single seed fallback is the listing the picker needs.

**Turn on the installed catalog in the tui patch.** Rejected because `/model` should offer usable routes, not every pi-ai catalog model. Extra providers without an ambient key still belong in `$DSH_HOME/settings.yaml` `llm-pi-ai:`. Providers whose API keys are already in the process environment auto-register without that dump.

**Turn on the installed catalog in base.** Rejected because dumping every catalog provider would change web composition. Ambient-key registration is the narrower expansion: only providers the process can already authenticate appear in selectors.

**OMP model roles, fallback chains, path-scoped models, and OAuth.** Deferred. `/model` is session selection over the llm registry, not OMP's Settings/Registry types.

**Fill the empty viewport with an OMP-style welcome screen.** Rejected because dsh's header is a few rows; padding the editor to the bottom is the layout, not extra onboarding copy.

## Consequences

Interactive `dsh` requires bun >= 1.3.14 on PATH. `dsh web` and `dsh --profile headless` do not. A host without bun still dumps tui config and prints launcher help.

The TUI process loads the same base plugin tree as Node. bun's parser rejects a `declare` value binding, so `dsh-llm-pi-ai` uses another helper name. bun does not export `node:module.stripTypeScriptTypes`; the worker runtime then type-strips with amaro. bun also has no Node ESM `loader.internal`, so the launcher's watch-only HMR (`root: []`) starts without `--expose-internals`; module-reload roots still require it. `boot()` lists `AggregateError` members so concurrent load failures name every row.

TUI `/model` lists routes `ctx.llm` currently has registered, including catalog providers whose ambient API keys are set and `ollama-cloud` when `OLLAMA_API_KEY` is set. Adding a provider that has no key in the environment is still a settings profile, not a TUI catalog dump. A local Ollama daemon is still a hand-declared route; `OLLAMA_HOST` alone does not register one.

Node coverage does not measure `packages/bundle/tui/src`. Correctness for that tree is `pnpm run test:tui` under bun.

## Testing

`apps/cli` unit-tests the bun version floor and, in source-launch / built-bin smokes, accepts either `tui requires an interactive TTY` (bun re-execed) or the missing-bun diagnostic. `dsh-llm-pi-ai` unit-tests dormant default, catalog expansion, ambient-key registration (including withholding catalog `deepseek` and registering `ollama-cloud` from `OLLAMA_API_KEY`), settings overlay of a stub, and Cloud `listModels` interrogation with seed fallback. TUI package tests under bun cover palettes `/theme`, the overlay picker, `/model` against a fake `ctx.llm`, FakeTerminal sessions, chrome, pinning the editor to the last rows of a short viewport, streamed plus replayed reasoning, and the approval overlay. There is still no keyless assembled TUI snapshot; presentation remains the package semantic matrix.
