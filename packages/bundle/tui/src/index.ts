/**
 * @deepseek-ai/dsh-tui — interactive terminal UI over a direct Agent. The
 * bundle patch rides over dsh-base without Host, HTTP, or browser plugins;
 * this runtime owns the TTY through pi-tui, creates or resumes one persisted
 * Agent, and exits through the launcher-provided `ctx.appExit` host hook.
 *
 * @module @deepseek-ai/dsh-tui
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-questions'
import { internals, TuiApp, type TuiIo } from './app.ts'

export { internals, TuiApp } from './app.ts'
export { SlashAutocomplete } from './autocomplete.ts'
export { QuestionForm, createQuestionProvider } from './questions.ts'
export { wrapLine, extractText } from './transcript.ts'

/** Stable Cordis plugin name. */
export const name = 'tui-runtime'

/** Core services required before the terminal session can start. */
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'commands', 'userQuestions']

/** Plugin config: the resume id resolved from this app's injected provider. */
export interface Config {
  /** Persisted session id; empty creates a fresh session. */
  resume: string
}

export const Config: z<Config> = z.object({
  resume: z.string().default(''),
})

/** Report an unexpected driver failure and request a failing exit. */
function fail(io: TuiIo, error: unknown): void {
  io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
  io.exit(1)
}

/**
 * Mount the interactive terminal runtime.
 * @param ctx - plugin context carrying core services and the launcher-provided exit request.
 * @param config - validated resume config.
 */
export function apply(ctx: Context, config: Config): void {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('tui-runtime: the launcher must provide ctx.appExit before the tree mounts')
  }
  const io: TuiIo = { stderr: internals.stderr, exit }
  if (!internals.isTTY()) {
    io.stderr.write('dsh: tui requires an interactive TTY\n')
    io.exit(1)
    return
  }
  const app = new TuiApp(ctx, config.resume, io)
  ctx.effect(() => {
    void app.start().catch((error: unknown) => { fail(io, error) })
    return () => { app.stop() }
  })
}
