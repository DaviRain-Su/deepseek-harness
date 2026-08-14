/** Footer chips and `/jobs` picker rows. */

import { describe, expect, it } from 'vitest'
import { formatStatusChips, jobPickerItem, todoCounts } from '../src/status.ts'

describe('formatStatusChips', () => {
  it('returns empty when nothing is active', () => {
    expect(formatStatusChips({})).toBe('')
    expect(formatStatusChips({ plan: { active: false, pending: false }, todos: [], jobs: [] })).toBe('')
  })

  it('shows plan, pending plan, goal phase, todo counts, and live jobs', () => {
    expect(formatStatusChips({ plan: { active: true, pending: false } })).toBe('plan')
    expect(formatStatusChips({ plan: { active: false, pending: true } })).toBe('plan…')
    expect(formatStatusChips({ goal: { objective: 'Ship  the  feature', phase: 'active' } }))
      .toBe('goal Ship the feature')
    expect(formatStatusChips({ goal: { objective: 'Ship it', phase: 'paused' } }))
      .toBe('goal paused Ship it')
    expect(formatStatusChips({
      todos: [
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'in_progress' },
        { content: 'c', status: 'pending' },
      ],
    })).toBe('1/3 todos')
    expect(formatStatusChips({
      jobs: [{ id: 'bash-1', label: 'sleep', status: 'running' }],
    })).toBe('1 jobs')
    expect(formatStatusChips({
      jobs: [{ id: 'bash-1', label: 'sleep', status: 'completed' }],
    })).toBe('1 jobs done')
    expect(formatStatusChips({ preset: 'standard' })).toBe('preset standard')
  })
})

describe('todoCounts', () => {
  it('tallies each status', () => {
    expect(todoCounts([
      { content: 'a', status: 'pending' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'in_progress' },
      { content: 'd', status: 'completed' },
    ])).toEqual({ pending: 1, inProgress: 2, completed: 1, total: 4 })
  })
})

describe('jobPickerItem', () => {
  it('labels status and omits an empty detail', () => {
    expect(jobPickerItem({ id: 'bash-1', label: 'sleep', status: 'running' }))
      .toEqual({ value: 'bash-1', label: 'running · sleep' })
    expect(jobPickerItem({ id: 'bash-1', label: 'sleep', status: 'failed', detail: 'exit 1' }))
      .toEqual({ value: 'bash-1', label: 'failed · sleep', description: 'exit 1' })
    expect(jobPickerItem({ id: 'bash-1', label: 'sleep', status: 'running', detail: '' }))
      .toEqual({ value: 'bash-1', label: 'running · sleep' })
  })
})
