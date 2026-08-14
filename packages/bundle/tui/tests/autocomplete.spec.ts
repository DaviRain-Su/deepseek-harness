/** Slash-command and skill-name autocomplete. */

import { describe, expect, it } from 'vitest'
import { SlashAutocomplete } from '../src/autocomplete.ts'

const commands = [
  { name: 'help', description: 'List slash commands' },
  { name: 'exit', description: 'Exit the terminal UI' },
]

describe('SlashAutocomplete', () => {
  const provider = new SlashAutocomplete(() => commands)

  it('suggests names that start with the current / prefix', async () => {
    expect(await provider.getSuggestions(['/he'], 0, 3)).toEqual({
      items: [{ value: '/help', label: '/help', description: 'List slash commands' }],
      prefix: '/he',
    })
    expect(await provider.getSuggestions(['/z'], 0, 2)).toBeNull()
    expect(await provider.getSuggestions(['/help me'], 0, 8)).toBeNull()
    expect(await provider.getSuggestions(['hello'], 0, 5)).toBeNull()
    expect(await provider.getSuggestions([], 0, 0)).toBeNull()
  })

  it('replaces the matched prefix with the selected command', () => {
    expect(provider.applyCompletion(['/he'], 0, 3, { value: '/help', label: '/help' }, '/he'))
      .toEqual({ lines: ['/help'], cursorLine: 0, cursorCol: 5 })
    expect(provider.applyCompletion([], 0, 0, { value: '/exit', label: '/exit' }, '/'))
      .toEqual({ lines: ['/exit'], cursorLine: 0, cursorCol: 5 })
  })

  it('appends user-invocable skills after commands and shadows a command name', async () => {
    const withSkills = new SlashAutocomplete(() => commands, async () => [
      { name: 'help', description: 'A skill that must not appear' },
      { name: 'review', description: 'Review the change' },
      { name: 'report', description: 'Write a report' },
    ])
    expect(await withSkills.getSuggestions(['/'], 0, 1)).toEqual({
      items: [
        { value: '/help', label: '/help', description: 'List slash commands' },
        { value: '/exit', label: '/exit', description: 'Exit the terminal UI' },
        { value: '/review', label: '/review', description: 'Review the change' },
        { value: '/report', label: '/report', description: 'Write a report' },
      ],
      prefix: '/',
    })
    expect(await withSkills.getSuggestions(['/re'], 0, 3)).toEqual({
      items: [
        { value: '/review', label: '/review', description: 'Review the change' },
        { value: '/report', label: '/report', description: 'Write a report' },
      ],
      prefix: '/re',
    })
    expect(await withSkills.getSuggestions(['/hel'], 0, 4)).toEqual({
      items: [{ value: '/help', label: '/help', description: 'List slash commands' }],
      prefix: '/hel',
    })
  })

  it('omits skills when the catalog is empty', async () => {
    const empty = new SlashAutocomplete(() => commands, async () => [])
    expect(await empty.getSuggestions(['/re'], 0, 3)).toBeNull()
  })
})
