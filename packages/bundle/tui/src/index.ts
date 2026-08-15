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
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-settings'
import { internals, TuiApp, type TuiIo } from './app.ts'
import {
  TUI_THEME_SETTINGS_NAMESPACE,
  TUI_THEME_SETTINGS_SCHEMA,
  type TuiThemeSettings,
} from './theme-settings.ts'

export { internals, TuiApp } from './app.ts'
export { SlashAutocomplete } from './autocomplete.ts'
export type { SlashSkillItem } from './autocomplete.ts'
export { createApprovalAnswerer, promptApproval } from './approval.ts'
export { createTuiAuthInteraction, formatAuthStatus } from './login.ts'
export { formatSessionCreatedAt, sessionPickerItem } from './sessions.ts'
export { deriveKeyRef, apiKeyRefusal, providerCredentialRows } from './settings.ts'
export { presetPickerItem, sessionBlank } from './presets.ts'
export { QuestionForm, createQuestionProvider } from './questions.ts'
export { wrapLine, extractText } from './transcript.ts'
export { PALETTE_KEYS, themeInternals } from './theme.ts'
export { parseThemeDocument } from './theme-file.ts'
export {
  TUI_THEME_SETTINGS_NAMESPACE,
  TUI_THEME_SETTINGS_SCHEMA,
  type TuiThemeSettings,
} from './theme-settings.ts'

/** Stable Cordis plugin name. */
export const name = 'tui-runtime'

/** Core services required before the terminal session can start. */
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'commands', 'userQuestions', 'approval']

/** Plugin config: resume id from `tuiStartup`, plus the composition-default `/theme` id. */
export interface Config {
  /** Persisted session id; empty creates a fresh session. */
  resume: string
  /** Composition default `/theme` id; settings overlay the user's last pick. */
  theme?: string
}

/** Schema of {@link Config}. */
export const Config: z<Config> = z.object({
  resume: z.string().default(''),
  theme: z.string().default('dark'),
})

/** Report an unexpected driver failure and request a failing exit. */
function fail(io: TuiIo, error: unknown): void {
  io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
  io.exit(1)
}

/**
 * Mount the interactive terminal runtime.
 * @param ctx - plugin context carrying core services and the launcher-provided exit request.
 * @param config - validated resume and composition-default theme.
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
  const entry: TuiThemeSettings = { theme: config.theme ?? 'dark' }
  let themeSource: () => TuiThemeSettings = () => entry
  let themeSettingsWired = false
  const wireThemeSettings = (): void => {
    if (themeSettingsWired || ctx.get('settings') === undefined) return
    themeSettingsWired = true
    installSettingsSection(ctx, TUI_THEME_SETTINGS_NAMESPACE, TUI_THEME_SETTINGS_SCHEMA, entry, {
      setSource: (current) => { themeSource = current },
      onChange: () => {},
    })
  }
  // Register only when settings is already on the context. A waiting
  // inject(['settings']) would hang a tree that never mounts a provider;
  // start() retries after Loader settlement, when base has provided it.
  wireThemeSettings()
  const app = new TuiApp(ctx, config.resume, io, () => themeSource(), wireThemeSettings)
  ctx.effect(() => {
    void app.start().catch((error: unknown) => { fail(io, error) })
    return () => app.dispose()
  })
}
