/**
 * The interactive terminal app's command-line provider: it parses `--resume`
 * / `--session` and `--help`, then publishes {@link TUI_STARTUP_SERVICE}. The
 * runtime is an ordinary consumer whose lazy config waits for that service.
 * @module @deepseek-ai/dsh-tui/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'tui-startup'

/** Services required before the invocation can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the terminal runtime. */
export const TUI_STARTUP_SERVICE = 'tuiStartup'

/** What the runtime row reads from {@link TUI_STARTUP_SERVICE}. */
export interface TuiStartupValues {
  /**
   * Persisted session id to resume. Empty creates a fresh session.
   */
  resume: string
}

/** The TUI flag family, as commander parsed it. */
interface TuiOptions {
  resume?: string
  session?: string
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function tuiCommand(): Command {
  return new Command()
    .name('dsh')
    .description('Interactive terminal UI for one persisted coding session.')
    .helpOption('-h, --help', 'show this help')
    .option('--resume <session>', 'resume a persisted session by id')
    .option('--session <session>', 'alias of --resume')
    .addHelpText('after', `
Examples:
  dsh                          start a new session
  dsh --resume <session>       resume a persisted session
`)
}

/**
 * Parse and provide the TUI invocation as an ordinary Cordis service. The
 * command's action publishes the resume id this invocation named; conflicting
 * `--resume` / `--session` values are a usage error, so on rejection (and on
 * `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = tuiCommand()
  program.action(() => {
    const options = program.opts<TuiOptions>()
    if (
      options.resume !== undefined
      && options.session !== undefined
      && options.resume !== options.session
    ) {
      program.error('error: --resume and --session must name the same session')
    }
    const resume = (options.resume ?? options.session ?? '').trim()
    ctx.provide(TUI_STARTUP_SERVICE, { resume } satisfies TuiStartupValues)
  })
  parseCmdline(ctx, program)
}
