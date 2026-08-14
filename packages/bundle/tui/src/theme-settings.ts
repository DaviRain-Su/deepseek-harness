/**
 * Settings namespace for the TUI `/theme` id.
 * @module @deepseek-ai/dsh-tui/theme-settings
 */

import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace for the TUI `/theme` selection. */
export const TUI_THEME_SETTINGS_NAMESPACE = settingsNamespace('tui-theme')

/** Persisted `/theme` id. */
export interface TuiThemeSettings {
  /** Builtin id or `$DSH_HOME/themes/<id>.json` stem. */
  theme: string
}

/** Schema of the TUI theme settings section. */
export const TUI_THEME_SETTINGS_SCHEMA: z<TuiThemeSettings> = z.object({
  theme: z.string().default('dark'),
})
