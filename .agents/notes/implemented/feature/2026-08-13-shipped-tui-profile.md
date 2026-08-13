# Agent Note: Shipped interactive TUI profile

Status: implemented

English | [中文](2026-08-13-shipped-tui-profile.zh.md)

## Problem

The product ships an interactive browser profile (`dsh web` / `--profile web`) and a one-shot CLI (`dsh --profile headless "task"`). There is no in-box interactive terminal. The earlier `@deepseek-ai/dsh-tui` under the ui group was deleted because it had no product owner, no shipped composition, and a patched `pi-tui` artifact; [that removal](../simplification/2026-08-04-remove-tui-package.md) still stands for that package. Reintroduction needs a named product, an explicit bundle boundary, a concrete interaction provider, and assembled tests — not a restore of the deleted tree.

## Decision

Omitting `--profile` boots the shipped `tui` template: `@deepseek-ai/dsh-base` then `@deepseek-ai/dsh-tui`. `--profile tui` is the same composition. There is no `dsh tui` alias; `dsh --help` and `dsh -h` still print launcher help so web, headless, and plugin stay discoverable. The tui bundle owns `--resume` / `--session` the same way headless owns the task positional.

`@deepseek-ai/dsh-tui` is a new bundle under `packages/bundle/tui/`. Its patch rides directly over base: coding persona, process tool mode, HMR off, Code Mode worker, `tui-startup`, and `tui-runtime`. It mounts no Host, HTTP server, Web runtime, or browser plugin. Tools stay on the host plane. The runtime reads `ctx.agentDefaultModel`, creates or resumes one persisted Agent through `ctx.agents`, and owns the TTY through unpatched `@earendil-works/pi-tui`. The interactive layout and dark theme follow [Pi's coding-agent interactive mode](https://github.com/earendil-works/pi): accent header with key hints, user-message `Box`, Markdown assistant blocks, `presentCall`/`presentResult` tool cards with pending/success/error backgrounds, muted-border editor, cwd/model footer. Typed lines become user messages; `/` lines stay in `dsh-commands` (`/help`, `/exit`, `/quit` register here). Ask-user prompts use `dsh-user-questions` overlays. Ctrl+C cancels a running Agent and exits when idle; Ctrl+D exits. Teardown stops pi-tui, drains input, flushes the Session, and requests exit through launcher-owned `ctx.appExit`. A missing TTY is a usage error.

This does not restore the deleted ui-group TUI tree, its snapshots, its patched `pi-tui`, or its SDK scaffolding.

## Alternatives considered

**Ship turtle-ui as the official third-party path only.** Rejected because the product needs an in-box interactive terminal with the same profile-template, in-box bundle, and assembled-test bar as web and headless. Out-of-tree plugins remain valid; they are not the shipped TUI.

**Restore the deleted ui-group TUI tree.** Rejected because that tree was a product-sized frontend without a current owner, and the removal's reintroduction conditions ask for a new boundary rather than inheritance of the deleted implementation.

**Add a `dsh tui` alias.** Rejected because only `dsh web` is aliased; the default profile already opens the terminal.

**Keep omitted `--profile` as an error.** Rejected because the product entry is the interactive terminal; web and headless stay explicit (`dsh web` or `--profile headless`).

**Put tools on a TUI-local plane or add Host/HTTP.** Rejected because the TUI is a direct Agent over base, like headless, not a second Web stack.

**Switch the renderer to `@oh-my-pi/pi-tui`.** Rejected because that package ships TypeScript source, declares a bun engine, and pulls `pi-natives`; the shipped Node CLI consumes compiled `@earendil-works/pi-tui`, which already provides Markdown, Editor, `Box`, and display-column wrap. Pi's interactive-mode layout and dark theme (header, Markdown chat, tool cards, muted editor border, cwd/model footer) are the application layer on top of that engine.

## Consequences

Interactive terminal use is `dsh` and `dsh --resume <id>` (`--profile tui` is equivalent). Existing `$DSH_HOME/profiles/tui` directories that already hold a user-owned bundle list are left unchanged; a missing tui profile auto-initializes to base + tui. The deleted ui-group TUI tree remains absent.

The runtime does not list or switch sessions, does not present permission prompts, and does not complete skill names from `ctx.skills`. The transcript is a user-message bubble, Markdown assistant blocks, and `presentCall`/`presentResult` tool cards; wrapping uses pi-tui display columns. Editor, Markdown, and select-list chrome use Pi's dark truecolor tokens. The main transcript is a scrollback, not an alternate screen.

## Testing

Package tests cover transcript formatting, Markdown chat blocks, tool-card mapping, header/footer chrome, slash autocomplete, question overlays, the Loader startup provider (`--resume` / `--session` / `--help`), and a FakeTerminal session (create/resume, submit, slash dispatch, Ctrl+C/Ctrl+D, teardown). The built and source `dsh` bins pin a non-TTY bare invocation to `tui requires an interactive TTY`, `--profile tui --help` and `--dump-default-config` (contains `dsh-tui`, no Host/Web/client rows), and still omit `tui` from launcher-owned subcommands. There is no keyless assembled TUI snapshot example; presentation is the package semantic matrix, and Terminal is the test seam.
