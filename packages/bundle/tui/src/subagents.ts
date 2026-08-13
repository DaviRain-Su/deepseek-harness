/**
 * Live subagent run cards: `subagent/start` opens one card per run, the tracked
 * child session's own events fold into a rolling activity feed, and
 * `subagent/end` settles the card. The lifecycle pair is transient, so a
 * resumed session shows no run cards — the delegation's durable tool call and
 * result still render in the parent transcript.
 * @module @deepseek-ai/dsh-tui/subagents
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type { SubagentRunEndInfo, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Container } from '@oh-my-pi/pi-tui'
import { presentToolCall } from './transcript.ts'
import { linesForCall, ToolCard } from './tools.ts'

/** Activity rows one run card keeps; older lines fold into an "earlier" count. */
const SUBAGENT_ACTIVITY_ROWS = 6

/**
 * Process services the tracker reads through narrow closures, so tests never
 * build a Cordis context.
 */
export interface SubagentTrackerHooks {
  /**
   * Resolve a still-registered child agent for tool presentation.
   * @param id - the child session id carried by `subagent/start`.
   * @returns the live child, or undefined once its handle disposed.
   */
  resolveAgent(id: SessionId): Agent | undefined
  /**
   * Resolve a tool definition visible to one agent's scope.
   * @param name - the called tool name.
   * @param agent - the calling child; undefined falls back to deployment scope.
   * @returns the definition, or undefined for the generic card.
   */
  lookupTool(name: string, agent: Agent | undefined): ToolDefinition | undefined
  /**
   * Report the live running-run count for the footer.
   * @param running - runs started but not yet settled.
   */
  countChanged(running: number): void
}

interface RunState {
  readonly card: ToolCard
  readonly provider: string
  /** Durable creation label from the child's `subagent/descriptor`. */
  label: string | undefined
  /** Rolling activity tail, capped at {@link SUBAGENT_ACTIVITY_ROWS}. */
  readonly activity: string[]
  /** Activity lines dropped from the front of {@link RunState.activity}. */
  earlier: number
  /** Child `tool/call` count, reported in the settled summary. */
  tools: number
  /** Open child calls by call id, so a failing result can name its tool. */
  readonly pendingTools: Map<string, string>
  done: boolean
}

/**
 * One card per subagent run, appended chronologically to the transcript.
 * Child sessions are matched by session id, so nested delegations render flat
 * alongside their parent's siblings rather than under the parent's card.
 */
export class SubagentTracker {
  private readonly runs = new Map<string, RunState>()
  private readonly byChild = new Map<string, RunState>()
  private running = 0

  /**
   * @param container - the transcript container cards append to.
   * @param hooks - narrow service accessors.
   */
  constructor(
    private readonly container: Container,
    private readonly hooks: SubagentTrackerHooks,
  ) {}

  /**
   * Open a card for one `subagent/start`. A repeated run id is ignored: the
   * lifecycle emitter publishes each edge exactly once, and a duplicate would
   * double-count the footer.
   * @param info - the run identity.
   */
  start(info: SubagentRunInfo): void {
    if (this.runs.has(info.runId)) return
    const state: RunState = {
      card: new ToolCard(pendingTitle(undefined, info.provider), []),
      provider: info.provider,
      label: undefined,
      activity: [],
      earlier: 0,
      tools: 0,
      pendingTools: new Map(),
      done: false,
    }
    this.runs.set(info.runId, state)
    this.byChild.set(info.id, state)
    this.container.addChild(state.card)
    this.running += 1
    this.hooks.countChanged(this.running)
  }

  /**
   * Fold one session event into the run card that owns its session.
   * @param session - the event's session; the parent's own session is rejected.
   * @param event - the durable event.
   * @returns whether the session belongs to a tracked run, settled or not.
   */
  sessionEvent(session: Session, event: SessionEvent): boolean {
    const state = this.byChild.get(session.id)
    if (state === undefined) return false
    if (!state.done) this.fold(state, session, event)
    return true
  }

  /**
   * Settle the card for one `subagent/end`: the title gains the stop reason,
   * the body keeps the activity tail plus a tool-call summary, and a
   * non-`completed` reason paints the error background.
   * @param info - the run identity and terminal outcome.
   * @returns whether this end actually settled a live run (so the TUI may bell).
   */
  end(info: SubagentRunEndInfo): boolean {
    const state = this.runs.get(info.runId)
    if (state === undefined || state.done) return false
    state.done = true
    this.running -= 1
    const failed = info.stopReason !== 'completed'
    const summary = `${String(state.tools)} tool call${state.tools === 1 ? '' : 's'} · ${info.stopReason}`
    state.card.complete(`${pendingTitle(state.label, state.provider)} — ${info.stopReason}`, [
      ...this.body(state),
      summary,
    ], failed)
    this.hooks.countChanged(this.running)
    return true
  }

  private fold(state: RunState, session: Session, event: SessionEvent): void {
    if (event.type === 'subagent/descriptor') {
      if (state.label === undefined && typeof event.data.label === 'string') {
        state.label = event.data.label
        state.card.update(pendingTitle(state.label, state.provider), this.body(state))
      }
      return
    }
    if (event.type === 'tool/call') {
      const agent = this.hooks.resolveAgent(session.id)
      const view = presentToolCall(
        name => this.hooks.lookupTool(name, agent),
        event.data.name,
        event.data.arguments,
      )
      state.pendingTools.set(event.data.callId, event.data.name)
      state.tools += 1
      this.push(state, linesForCall(view).title)
      return
    }
    if (event.type === 'tool/result') {
      const [block] = event.data.message.content
      const name = state.pendingTools.get(event.data.message.source.callId) ?? 'tool'
      state.pendingTools.delete(event.data.message.source.callId)
      if (block.isError === true || event.data.error !== undefined) {
        this.push(state, `✗ ${name} failed`)
      }
    }
  }

  private push(state: RunState, line: string): void {
    state.activity.push(line)
    if (state.activity.length > SUBAGENT_ACTIVITY_ROWS) {
      state.activity.shift()
      state.earlier += 1
    }
    state.card.update(pendingTitle(state.label, state.provider), this.body(state))
  }

  private body(state: RunState): string[] {
    return [
      ...state.earlier > 0 ? [`… ${String(state.earlier)} earlier`] : [],
      ...state.activity,
    ]
  }
}

function pendingTitle(label: string | undefined, provider: string): string {
  return `⏵ ${label ?? `subagent · ${provider}`}`
}
