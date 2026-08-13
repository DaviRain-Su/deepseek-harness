# `@deepseek-ai/dsh-tui`

English | [中文](README.zh.md)

The dsh interactive terminal bundle. The `dsh` launcher boots this profile when `--profile` is omitted. [`cordis.patch.yml`](cordis.patch.yml) rides directly over [`dsh-base`](../base/README.md): it supplies the coding persona and tool mode, disables HMR, mounts Code Mode's worker as a core execution capability, and inserts this package's `tui-runtime` plugin (config `{resume}`, resolved from the injected `tuiStartup` provider). It mounts no Host, HTTP server, Web runtime, or browser plugin.

After the Loader settles, the runtime reads the shared [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md), creates or resumes one persisted Agent through `ctx.agents`, and owns the TTY through [`@oh-my-pi/pi-tui`](https://www.npmjs.com/package/@oh-my-pi/pi-tui). The Node `dsh` launcher re-execs this profile under bun >= 1.3.14; missing bun is a usage error before the TTY check. The session layout follows Pi's interactive TUI with OMP chrome: a colored product header with key hints, a transcript of a user-message bubble, dim Thinking blocks for `reasoning-delta`, Markdown assistant blocks, and [`presentCall` / `presentResult`](../../core/tools/README.md) tool cards, a muted rounded-border editor, and a two-line cwd/model footer. The editor and footer sit on the last rows of the TTY until the transcript fills the viewport. `/model` (also Ctrl+P / Alt+P) lists registered `ctx.llm` routes — DeepSeek official plus any pi-ai profiles in settings — writes the live selection, and persists it through `agentDefaultModel.saveSelection`. `/theme` switches among the built-in palettes `dark`, `dark-tokyo-night`, `dark-catppuccin`, and `light`. Typed lines become ordinary user messages; lines beginning with `/` stay in the [`dsh-commands`](../../interaction/commands/README.md) command plane (`/help`, `/model`, `/theme`, `/exit`, and `/quit` are registered here). Ask-user prompts use [`dsh-user-questions`](../../interaction/user-questions/README.md) overlays. Ctrl+C cancels a running Agent and exits when idle; Ctrl+D exits. Teardown stops pi-tui, drains input, flushes the Session, and requests exit through the launcher-provided `ctx.appExit` host hook ([`dsh-cmdline`](../../boot/cmdline/README.md)). A missing TTY is a usage error. The invocation is this app's command line: the ordinary `tui-startup` provider ([`src/startup.ts`](src/startup.ts)) injects `ctx.cmdlineArgs`, reads `--resume` / `--session`, prints the app's `--help`, and provides `tuiStartup`; the runtime injects that service and reads its resume id from lazy config.

## Model Experience

None, as the runtime submits typed lines as ordinary user messages; prompts and tools belong to the base and tui bundle rows.

#### KV Cache effect

None; the runtime adds nothing to the request prefix.

## Known Limitations and Deferred Work

- **One session per process** — the runtime does not list or switch sessions; `--resume` names an id the persistence backend already holds.
- **No permission-prompt UI** — bash and filesystem mutations follow the process permission preset, not an in-terminal approval overlay.
- **No live skill-catalog completions** — slash autocomplete reads `dsh-commands` only; skill names are not suggested from `ctx.skills`.
- **Interactive `dsh` requires bun >= 1.3.14** — `dsh web` and `dsh --profile headless` stay on Node; dump-config and launcher `--help` do too.
- **`ctx.appExit` is launcher-owned** — booting the tui profile outside the `dsh` launcher fails loud at activation until the host provides the exit request.
