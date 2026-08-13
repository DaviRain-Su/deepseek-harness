/**
 * Slash-command autocomplete over the live command catalog.
 * @module @deepseek-ai/dsh-tui/autocomplete
 */

import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from '@earendil-works/pi-tui'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands'

/**
 * Completes `/name` prefixes from {@link CommandDescriptor} snapshots.
 */
export class SlashAutocomplete implements AutocompleteProvider {
  /**
   * @param list - live catalog reader; called on each suggestion query.
   */
  constructor(private readonly list: () => readonly CommandDescriptor[]) {}

  /**
   * Suggest slash commands whose names start with the current `/` prefix.
   * @param lines - editor buffer.
   * @param cursorLine - focused row index.
   * @param cursorCol - cursor column on that row.
   * @param options - pi-tui request options (abort signal); unused for a sync catalog.
   * @returns matching items, or `null` when this is not a slash-name token.
   */
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    void options
    const before = (lines[cursorLine] ?? '').slice(0, cursorCol)
    if (!before.startsWith('/') || before.includes(' ')) return Promise.resolve(null)
    const prefix = before.slice(1)
    const items = this.list()
      .filter(command => command.name.startsWith(prefix))
      .map(command => ({
        value: `/${command.name}`,
        label: `/${command.name}`,
        description: command.description,
      }))
    if (items.length === 0) return Promise.resolve(null)
    return Promise.resolve({ items, prefix: before })
  }

  /**
   * Replace the matched `/` prefix with the selected command name.
   * @param lines - editor buffer.
   * @param cursorLine - focused row index.
   * @param cursorCol - unused; the prefix length owns the replacement span.
   * @param item - selected suggestion.
   * @param prefix - the `/` token returned by {@link getSuggestions}.
   * @returns the updated buffer and cursor at the end of the inserted name.
   */
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    void cursorCol
    const line = lines[cursorLine] ?? ''
    const next = item.value + line.slice(prefix.length)
    const nextLines = lines.slice()
    nextLines[cursorLine] = next
    return { lines: nextLines, cursorLine, cursorCol: item.value.length }
  }
}
