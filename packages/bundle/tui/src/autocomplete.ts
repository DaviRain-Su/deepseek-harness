/**
 * Slash autocomplete over the live command catalog and user-invocable skills.
 * A name that exists as a command is never also offered as a skill.
 * @module @deepseek-ai/dsh-tui/autocomplete
 */

import type {
  AutocompleteItem,
  AutocompleteProvider,
} from '@oh-my-pi/pi-tui'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands'

/** One user-invocable skill the slash catalog may offer. */
export interface SlashSkillItem {
  /** Kebab-case skill name without a leading slash. */
  readonly name: string
  /** Short routing description shown beside the name. */
  readonly description: string
}

/**
 * Completes `/name` prefixes from command descriptors and optional skill names.
 */
export class SlashAutocomplete implements AutocompleteProvider {
  /**
   * @param list - live command catalog; called on each suggestion query.
   * @param listSkills - live user-invocable skills; omitted when no skill registry is mounted.
   */
  constructor(
    private readonly list: () => readonly CommandDescriptor[],
    private readonly listSkills: () => Promise<readonly SlashSkillItem[]> = () => Promise.resolve([] as readonly SlashSkillItem[]),
  ) {}

  /**
   * Suggest slash commands and user-invocable skills whose names start with
   * the current `/` prefix. Command names win over a same-named skill.
   * @param lines - editor buffer.
   * @param cursorLine - focused row index.
   * @param cursorCol - cursor column on that row.
   * @returns matching items, or `null` when this is not a slash-name token.
   */
  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const before = (lines[cursorLine] ?? '').slice(0, cursorCol)
    if (!before.startsWith('/') || before.includes(' ')) return null
    const prefix = before.slice(1)
    const commands = this.list()
    const commandNames = new Set(commands.map(command => command.name))
    const commandItems = commands
      .filter(command => command.name.startsWith(prefix))
      .map(command => ({
        value: `/${command.name}`,
        label: `/${command.name}`,
        description: command.description,
      }))
    const skillItems = (await this.listSkills())
      .filter(skill => skill.name.startsWith(prefix) && !commandNames.has(skill.name))
      .map(skill => ({
        value: `/${skill.name}`,
        label: `/${skill.name}`,
        description: skill.description,
      }))
    const items = [...commandItems, ...skillItems]
    if (items.length === 0) return null
    return { items, prefix: before }
  }

  /**
   * Replace the matched `/` prefix with the selected command or skill name.
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
