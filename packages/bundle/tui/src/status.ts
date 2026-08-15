/**
 * Footer chips, `/jobs` rows, and `/todos` rows for plan, goal, todos, and background jobs.
 * Values come from session projections and `ctx.jobs`; this module only formats.
 * @module @deepseek-ai/dsh-tui/status
 */

import type { SelectItem } from '@oh-my-pi/pi-tui'
import type { TodoItem } from '@deepseek-ai/dsh-session'

/** Plan collaboration state as the `plan` projection reports it. */
export interface PlanStatus {
  /** Logged plan mode in force. */
  active: boolean
  /** True while a `/plan` selection has not yet committed. */
  pending: boolean
}

/** Durable goal fields the footer can show. */
export interface GoalStatus {
  /** Human-requested objective. */
  objective: string
  /** Durable lifecycle phase. */
  phase: string
}

/** One background job the `/jobs` picker can list. */
export interface JobStatusRow {
  /** Registry-issued id. */
  id: string
  /** Producer-supplied one-line label. */
  label: string
  /** Lifecycle state. */
  status: string
  /** Producer detail, when any. */
  detail?: string
}

/** Session-status facts the footer paints when any are present. */
export interface SessionStatusChips {
  /** Plan projection; omitted when the unit is not composed. */
  plan?: PlanStatus
  /** Current durable goal; omitted when none. */
  goal?: GoalStatus
  /** Standing todo list; omitted when the projection is null. */
  todos?: readonly TodoItem[]
  /** Visible jobs for this session. */
  jobs?: readonly JobStatusRow[]
  /** Live composed agent-preset id; omitted when the roster is absent. */
  preset?: string
}

/**
 * Count todos by status.
 * @param todos - the standing list.
 * @returns pending / in-progress / completed / total.
 */
export function todoCounts(todos: readonly TodoItem[]): {
  pending: number
  inProgress: number
  completed: number
  total: number
} {
  let pending = 0
  let inProgress = 0
  let completed = 0
  for (const item of todos) {
    if (item.status === 'pending') pending += 1
    else if (item.status === 'in_progress') inProgress += 1
    else completed += 1
  }
  return { pending, inProgress, completed, total: todos.length }
}

/**
 * Format footer chips. Empty when nothing in the session is active.
 * @param status - the latest projection and job cut.
 * @returns a ` · `-joined chip line, or ''.
 */
export function formatStatusChips(status: SessionStatusChips): string {
  const parts: string[] = []
  if (status.plan?.pending === true) parts.push('plan…')
  else if (status.plan?.active === true) parts.push('plan')
  if (status.goal !== undefined) {
    const objective = status.goal.objective.replace(/\s+/g, ' ').trim()
    parts.push(status.goal.phase === 'active' ? `goal ${objective}` : `goal ${status.goal.phase} ${objective}`)
  }
  if (status.todos !== undefined && status.todos.length > 0) {
    const counts = todoCounts(status.todos)
    parts.push(`${counts.completed}/${counts.total} todos`)
  }
  if (status.jobs !== undefined && status.jobs.length > 0) {
    const live = status.jobs.filter(job => job.status === 'running' || job.status === 'stopping').length
    parts.push(live > 0 ? `${live} jobs` : `${status.jobs.length} jobs done`)
  }
  if (status.preset !== undefined && status.preset.length > 0) parts.push(`preset ${status.preset}`)
  return parts.join(' · ')
}

/**
 * One `/jobs` picker row.
 * @param job - a visible job snapshot.
 * @returns a SelectList item whose value is the job id.
 */
export function jobPickerItem(job: JobStatusRow): SelectItem {
  return {
    value: job.id,
    label: `${job.status} · ${job.label}`,
    ...job.detail === undefined || job.detail.length === 0 ? {} : { description: job.detail },
  }
}

/**
 * One `/todos` picker row. The standing list has no stable id; the index is
 * the picker's value.
 * @param todo - one standing item.
 * @param index - the item's position in the current projection cut.
 * @returns a SelectList item whose value is the decimal index.
 */
export function todoPickerItem(todo: TodoItem, index: number): SelectItem {
  return {
    value: String(index),
    label: `${todo.status} · ${todo.content}`,
  }
}
