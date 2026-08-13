/** Slash-command autocomplete. */

import { describe, expect, it } from 'vitest'
import { SlashAutocomplete } from '../src/autocomplete.ts'

describe('SlashAutocomplete', () => {
  const provider = new SlashAutocomplete(() => [
    { name: 'help', description: 'List slash commands' },
    { name: 'exit', description: 'Exit the terminal UI' },
  ])
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
})
