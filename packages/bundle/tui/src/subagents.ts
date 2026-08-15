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
   * Report the live running count and per-run status for the footer.
   * @param running - runs started but not yet settled.
   * @param summaries - one {@link SubagentRunSummary} per running run, in
   *   start order; empty when no run is live.
   */
  runsChanged(running: number, summaries: readonly SubagentRunSummary[]): void
}

/**
 * One running subagent's footer-facing status. The footer paints one
 * `⏵ label: status` entry per summary while any run is live.
 */
export interface SubagentRunSummary {
  /** Descriptor label, or the `subagent · <provider>` fallback before one arrives. */
  readonly label: string
  /** `running <tool>` while a child tool call is pending, else `thinking`. */
  readonly status: string
}

/**
 * One tracked run in the Agent Hub roster. The hub lists every run — live and
 * recently settled — and opens a full transcript overlay for the chosen entry.
 */
export interface SubagentRosterEntry {
  /** The `subagent/start` run id; unique within the tracker. */
  readonly runId: string
  /** The child session id; the hub replays this session's log. */
  readonly childSessionId: SessionId
  /** Descriptor label, or the `subagent · <provider>` fallback. */
  readonly label: string
  /** Provider name from `subagent/start`. */
  readonly provider: string
  /** `thinking` / `running <tool>` while live, or the `subagent/end` stop reason. */
  readonly status: string
  /** True until `subagent/end` settles the run. */
  readonly running: boolean
}

interface RunState {
  readonly card: ToolCard
  readonly runId: string
  readonly childSessionId: SessionId
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
  /** Terminal stop reason from `subagent/end`; undefined while the run is live. */
  stopReason: SubagentRunEndInfo['stopReason'] | undefined
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
      runId: info.runId,
      childSessionId: info.id,
      provider: info.provider,
      label: undefined,
      activity: [],
      earlier: 0,
      tools: 0,
      pendingTools: new Map(),
      done: false,
      stopReason: undefined,
    }
    this.runs.set(info.runId, state)
    this.byChild.set(info.id, state)
    this.container.addChild(state.card)
    this.running += 1
    this.notify()
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
  /**
   * Forget every run after the transcript container is emptied. Cards are
   * already gone; this only clears identity maps and the running count.
   */
  reset(): void {
    this.runs.clear()
    this.byChild.clear()
    if (this.running === 0) return
    this.running = 0
    this.notify()
  }

  end(info: SubagentRunEndInfo): boolean {
    const state = this.runs.get(info.runId)
    if (state === undefined || state.done) return false
    state.done = true
    state.stopReason = info.stopReason
    this.running -= 1
    const failed = info.stopReason !== 'completed'
    const summary = `${String(state.tools)} tool call${state.tools === 1 ? '' : 's'} · ${info.stopReason}`
    state.card.complete(`${pendingTitle(state.label, state.provider)} — ${info.stopReason}`, [
      ...this.body(state),
      summary,
    ], failed)
    this.notify()
    return true
  }

  private fold(state: RunState, session: Session, event: SessionEvent): void {
    if (event.type === 'subagent/descriptor') {
      if (state.label === undefined && typeof event.data.label === 'string') {
        state.label = event.data.label
        state.card.update(pendingTitle(state.label, state.provider), this.body(state))
        this.notify()
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
      this.notify()
      return
    }
    if (event.type === 'tool/result') {
      const [block] = event.data.message.content
      const name = state.pendingTools.get(event.data.message.source.callId) ?? 'tool'
      state.pendingTools.delete(event.data.message.source.callId)
      if (block.isError === true || event.data.error !== undefined) {
        this.push(state, `✗ ${name} failed`)
      }
      this.notify()
    }
  }

  /**
   * Snapshot of every running run's footer status, in start order. Settled
   * runs are excluded; the footer hides the row entirely when this is empty.
   * @returns one summary per live run.
   */
  summaries(): readonly SubagentRunSummary[] {
    const out: SubagentRunSummary[] = []
    for (const state of this.runs.values()) {
      if (!state.done) out.push(this.summarize(state))
    }
    return out
  }

  /**
   * Snapshot of every tracked run for the Agent Hub roster, in start order.
   * Both live and settled runs appear until {@link reset} clears them, so the
   * user can inspect a run that just finished. Settled entries carry the
   * `subagent/end` stop reason as their status.
   * @returns one entry per tracked run, oldest first.
   */
  roster(): readonly SubagentRosterEntry[] {
    const out: SubagentRosterEntry[] = []
    for (const state of this.runs.values()) {
      out.push({
        runId: state.runId,
        childSessionId: state.childSessionId,
        label: state.label ?? `subagent · ${state.provider}`,
        provider: state.provider,
        status: state.done ? (state.stopReason ?? 'settled') : this.summarize(state).status,
        running: !state.done,
      })
    }
    return out
  }

  private summarize(state: RunState): SubagentRunSummary {
    const label = state.label ?? `subagent · ${state.provider}`
    const pending = Array.from(state.pendingTools.values())
    const status = pending.length > 0 ? `running ${pending[pending.length - 1]}` : 'thinking'
    return { label, status }
  }

  /** Push the current running count and per-run summaries to the footer hook. */
  private notify(): void {
    this.hooks.runsChanged(this.running, this.summaries())
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
