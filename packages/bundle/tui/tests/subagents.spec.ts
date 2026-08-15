/** Subagent run cards: lifecycle edges, child activity folding, and footer counts. */

import { describe, expect, it } from 'vitest'
import { Container } from '@oh-my-pi/pi-tui'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SubagentRunEndInfo, SubagentRunId, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { SubagentTracker, type SubagentRunSummary } from '../src/subagents.ts'

// SUBAGENT_DESCRIPTOR_VERSION: a literal keeps this suite from importing the
// service runtime (zod) that vite's bun resolver cannot reach from this package.
const DESCRIPTOR_VERSION = 2

function event<T extends SessionEvent['type']>(
  type: T,
  data: SessionEvent<T>['data'],
): SessionEvent<T> {
  return { type, seq: 1, time: 0, data } as SessionEvent<T>
}

function startInfo(runId: string, child: SessionId, provider = 'in-process'): SubagentRunInfo {
  return { runId: runId as SubagentRunId, provider, id: child, local: true }
}

function endInfo(runId: string, child: SessionId, stopReason: SubagentRunEndInfo['stopReason']): SubagentRunEndInfo {
  return { ...startInfo(runId, child), stopReason }
}

function childSession(id: string): Session {
  return { id: SessionId(id) } as Session
}

function harness() {
  const container = new Container()
  const counts: number[] = []
  const summaries: SubagentRunSummary[][] = []
  const resolved: string[] = []
  const tracker = new SubagentTracker(container, {
    resolveAgent: (id) => {
      resolved.push(id)
      return undefined
    },
    lookupTool: name => name === 'bash'
      ? ({ presentCall: () => ({ card: 'terminal' as const, title: 'pnpm test' }) } as unknown as ToolDefinition)
      : undefined,
    runsChanged: (running, snaps) => {
      counts.push(running)
      summaries.push(snaps)
    },
  })
  const text = () => container.render(80).join('\n')
  return { container, counts, summaries, resolved, tracker, text }
}

describe('SubagentTracker', () => {
  it('opens a card per start, settles it on end, and reports running counts', () => {
    const { tracker, counts, text } = harness()
    const child = SessionId('child-1')
    tracker.start(startInfo('run-1', child))
    expect(counts).toEqual([1])
    expect(text()).toContain('⏵ subagent · in-process')

    expect(tracker.end(endInfo('run-1', child, 'completed'))).toBe(true)
    expect(counts).toEqual([1, 0])
    expect(text()).toContain('⏵ subagent · in-process — completed')
    expect(text()).toContain('0 tool calls · completed')
  })

  it('ignores a repeated start and an unknown end', () => {
    const { tracker, counts, container } = harness()
    const child = SessionId('child-2')
    tracker.start(startInfo('run-1', child))
    tracker.start(startInfo('run-1', child))
    expect(tracker.end(endInfo('run-2', SessionId('nobody'), 'error'))).toBe(false)
    expect(counts).toEqual([1])
    expect(container.children).toHaveLength(1)
    expect(tracker.end(endInfo('run-1', child, 'completed'))).toBe(true)
    expect(tracker.end(endInfo('run-1', child, 'completed'))).toBe(false)
  })

  it('clears the running count when reset during a live run', () => {
    const { tracker, counts } = harness()
    tracker.start(startInfo('run-reset', SessionId('child-reset')))
    tracker.reset()
    expect(counts).toEqual([1, 0])
  })

  it('rejects foreign sessions and consumes tracked ones even after settling', () => {
    const { tracker } = harness()
    const child = SessionId('child-3')
    tracker.start(startInfo('run-1', child))
    expect(tracker.sessionEvent(childSession('other'), event('turn/start', { turn: 1 }))).toBe(false)
    expect(tracker.sessionEvent(childSession('child-3'), event('turn/start', { turn: 1 }))).toBe(true)
    tracker.end(endInfo('run-1', child, 'completed'))
    expect(tracker.sessionEvent(childSession('child-3'), event('turn/start', { turn: 2 }))).toBe(true)
  })

  it('labels the card from the child descriptor and folds tool activity', () => {
    const { tracker, resolved, text } = harness()
    const child = SessionId('child-4')
    tracker.start(startInfo('run-1', child))
    tracker.sessionEvent(childSession('child-4'), event('subagent/descriptor', {
      version: DESCRIPTOR_VERSION,
      mode: 'one-shot',
      provider: 'in-process',
      label: 'survey OMP',
    }))
    expect(text()).toContain('⏵ survey OMP')

    tracker.sessionEvent(childSession('child-4'), event('tool/call', {
      turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{"command":"pnpm test"}',
    }))
    expect(resolved).toEqual([child])
    expect(text()).toContain('❯ pnpm test')

    tracker.sessionEvent(childSession('child-4'), event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({
        callId: CallId('c1'), content: [{ type: 'text', text: 'failed' }], isError: true,
      }),
    }))
    expect(text()).toContain('✗ bash failed')

    tracker.end(endInfo('run-1', child, 'error'))
    expect(text()).toContain('⏵ survey OMP — error')
    expect(text()).toContain('1 tool call · error')
  })

  it('rolls the activity window and keeps the dropped count', () => {
    const { tracker, text } = harness()
    const child = SessionId('child-5')
    tracker.start(startInfo('run-1', child))
    for (let index = 0; index < 8; index += 1) {
      tracker.sessionEvent(childSession('child-5'), event('tool/call', {
        turn: 1, step: 1, callId: CallId(`c${String(index)}`), name: `tool-${String(index)}`, arguments: '{}',
      }))
    }
    const rendered = text()
    expect(rendered).toContain('… 2 earlier')
    expect(rendered).toContain('tool-7')
    expect(rendered).not.toContain('tool-1')
  })

  it('falls back to the tool name without a registered definition', () => {
    const { tracker, text } = harness()
    const child = SessionId('child-6')
    tracker.start(startInfo('run-1', child))
    tracker.sessionEvent(childSession('child-6'), event('tool/call', {
      turn: 1, step: 1, callId: CallId('c1'), name: 'mystery', arguments: 'not-json',
    }))
    expect(text()).toContain('● mystery')
  })

  it('reports per-run status as thinking, running <tool>, then thinking again', () => {
    const { tracker, summaries } = harness()
    const child = SessionId('child-status')
    tracker.start(startInfo('run-1', child))
    expect(summaries[summaries.length - 1]).toEqual([{ label: 'subagent · in-process', status: 'thinking' }])

    tracker.sessionEvent(childSession('child-status'), event('subagent/descriptor', {
      version: DESCRIPTOR_VERSION, mode: 'one-shot', provider: 'in-process', label: 'survey',
    }))
    expect(summaries[summaries.length - 1]).toEqual([{ label: 'survey', status: 'thinking' }])

    tracker.sessionEvent(childSession('child-status'), event('tool/call', {
      turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{}',
    }))
    expect(summaries[summaries.length - 1]).toEqual([{ label: 'survey', status: 'running bash' }])

    tracker.sessionEvent(childSession('child-status'), event('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({ callId: CallId('c1'), content: [{ type: 'text', text: 'ok' }] }),
    }))
    expect(summaries[summaries.length - 1]).toEqual([{ label: 'survey', status: 'thinking' }])

    tracker.end(endInfo('run-1', child, 'completed'))
    expect(summaries[summaries.length - 1]).toEqual([])
  })

  it('rosters live and settled runs with status and child session id', () => {
    const { tracker } = harness()
    const child = SessionId('child-roster')
    tracker.start(startInfo('run-1', child, 'claude-code'))
    tracker.sessionEvent(childSession('child-roster'), event('subagent/descriptor', {
      version: DESCRIPTOR_VERSION, mode: 'one-shot', provider: 'claude-code', label: 'survey',
    }))
    tracker.sessionEvent(childSession('child-roster'), event('tool/call', {
      turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{}',
    }))

    const live = tracker.roster()
    expect(live).toEqual([{
      runId: 'run-1',
      childSessionId: child,
      label: 'survey',
      provider: 'claude-code',
      status: 'running bash',
      running: true,
    }])

    tracker.end(endInfo('run-1', child, 'error'))
    const settled = tracker.roster()
    expect(settled).toEqual([{
      runId: 'run-1',
      childSessionId: child,
      label: 'survey',
      provider: 'claude-code',
      status: 'error',
      running: false,
    }])

    tracker.reset()
    expect(tracker.roster()).toEqual([])
  })
})
