/**
 * Live TUI session: one Agent, one pi-tui tree, slash commands, and questions.
 * @module @deepseek-ai/dsh-tui/app
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  Editor,
  Loader,
  ProcessTerminal,
  TUI,
  matchesKey,
} from '@oh-my-pi/pi-tui'
import type { OverlayHandle, SelectItem, Terminal } from '@oh-my-pi/pi-tui'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions, ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { resolveSessionPreset } from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { parseCommand } from '@deepseek-ai/dsh-commands'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmModelInfo, LlmReasoningEffortInfo, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-tools'
import { isUserInvocable } from '@deepseek-ai/dsh-skill'
import type { LlmOAuthService } from '@deepseek-ai/dsh-llm-oauth'
import type { SessionQueryEngine, SessionRecord, SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { SlashAutocomplete } from './autocomplete.ts'
import type { SlashSkillItem } from './autocomplete.ts'
import { MeasuredChild, SessionChrome, SessionFooter, SessionHeader, subagentWindowTitle } from './chrome.ts'
import { DiffOverlay, showDiffOverlay } from './diff-overlay.ts'
import { OverlayPicker, showPicker } from './picker.ts'
import { createApprovalAnswerer } from './approval.ts'
import type { ApprovalOverlayHandle } from './approval.ts'
import { promptPermissionPreset, settingsHubRows, inventoryRows, modelsRows, settingsSectionRows, providerCredentialRows, deriveKeyRef, apiKeyEnvOf, apiKeyRefusal, baseUrlOf, baseUrlRefusal, type PluginInventoryEntry, type ModelsProviderEntry, type SettingsSectionEntry } from './settings.ts'
import type { SettingsOverlayHandle } from './settings.ts'
import { createTuiAuthInteraction, formatAuthStatus, LOGIN_CANCELLED, LoginTextForm, type LoginOverlayHandle } from './login.ts'
import { presetPickerItem, sessionBlank } from './presets.ts'
import { createQuestionProvider } from './questions.ts'
import {
  isSwitchableSession,
  sessionPickerItem,
  sortSessionPickerEntries,
  type SessionPickerEntry,
} from './sessions.ts'
import { SubagentTracker } from './subagents.ts'
import {
  applyTuiTheme,
  currentTuiThemeId,
  fg,
  listTuiThemeItems,
  TUI_COLOR,
  TUI_EDITOR_THEME,
  TUI_SYMBOL_THEME,
} from './theme.ts'
import {
  TUI_THEME_SETTINGS_NAMESPACE,
  type TuiThemeSettings,
} from './theme-settings.ts'
import { TranscriptView, extractText } from './transcript.ts'
import { statsLine } from './stats.ts'
import { formatStatusChips, jobPickerItem } from './status.ts'
import type { JobStatusRow } from './status.ts'
// Type-only: load the SessionProjectionMap augmentation (tokenUsage /
// contextPressure / contextBreakdown from token-meter, sessionStats from
// session-stats) so a projection snapshot's values index to their projection
// types, and the ctx.sessionProjections service typing.
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session-stats'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-plan-mode/types'
import type {} from '@deepseek-ai/dsh-goal/types'
import type {} from '@deepseek-ai/dsh-tool-todo/src/types.ts'
import type {} from '@deepseek-ai/dsh-jobs'

/** Process-facing effects of one TUI run. */
export interface TuiIo {
  stderr: { write(chunk: string): unknown }
  /** Request process exit with `code` after the tree disposes. */
  exit(code: number): void
}

/** Test and production hooks for TTY construction. */
export const internals: {
  stderr: TuiIo['stderr']
  /** Whether stdin is a TTY. Tests replace this. */
  isTTY: () => boolean
  /** Construct the pi-tui terminal. Tests replace this with a fake. */
  createTerminal: () => Terminal
  /** Called after the TUI starts and the Agent is live. */
  onReady: (app: TuiApp) => void
} = {
  stderr: process.stderr,
  isTTY: () => process.stdin.isTTY,
  createTerminal: () => new ProcessTerminal(),
  onReady: () => {},
}

/** One asynchronous operation that may publish an overlay after an await. */
interface OverlayOperation {
  /** Renderer captured before the operation yielded. */
  readonly tui: TUI
  /** Generation invalidated when the owner hides or replaces an overlay. */
  readonly generation: number
}

/**
 * Drive one interactive terminal session against a live Agent.
 */
export class TuiApp {
  private readonly abort = new AbortController()
  private handle: AgentHandle | undefined
  private agent: Agent | undefined
  private tui: TUI | undefined
  private terminal: Terminal | undefined
  private selection: ModelSelectionRef | undefined
  private overlay: OverlayHandle | ApprovalOverlayHandle | LoginOverlayHandle | SettingsOverlayHandle | undefined
  /** True while an async operation may still publish an overlay. */
  private overlayOpening = false
  /** Invalidates async overlay work when the focused surface changes. */
  private overlayGeneration = 0
  /** True while the `/model` catalog overlay is the focused overlay. */
  private listingModels = false
  /** Provider ids last observed on `ctx.llm`, for addition notices. */
  private knownProviders = new Set<string>()
  private readonly transcript = new TranscriptView(name => this.ctx.get('tools')?.get(name, this.agent))
  private transcriptMount: MeasuredChild | undefined
  private sessionHeader: SessionHeader | undefined
  private subagents: SubagentTracker | undefined
  private readonly footer = new SessionFooter(process.cwd(), '')
  /** Route capacity resolved from the live model selection, shown before the first request. */
  private preheatedWindow: number | undefined
  private working: Loader | undefined
  private busy = false
  private subagentRunning = 0
  private stopped = false
  private exited = false
  /** Shared in-flight Agent teardown so repeat callers await quiescence. */
  private handleDisposal: Promise<void> | undefined
  private disposeStatsListener: (() => void) | undefined
  private disposeJobsListener: (() => void) | undefined

  /**
   * @param ctx - plugin context carrying core services and the launcher exit hook.
   * @param resume - persisted session id; empty creates a fresh session.
   * @param io - process-facing effects.
   * @param themeSource - resolved `tui-theme` section; composition default without settings.
   * @param wireThemeSettings - register the settings section once `ctx.settings` exists.
   */
  constructor(
    private readonly ctx: Context,
    private readonly resume: string,
    private readonly io: TuiIo,
    private readonly themeSource: () => TuiThemeSettings = () => ({ theme: 'dark' }),
    private readonly wireThemeSettings: () => void = () => {},
  ) {}

  /**
   * Settle the Loader, create or resume the Agent, and start the TUI.
   */
  async start(): Promise<void> {
    await this.ctx.get('loader')?.await()
    this.wireThemeSettings()
    const agents = this.ctx.get('agents')
    const defaultModel = this.ctx.get('agentDefaultModel')
    const sessions = this.ctx.get('sessions')
    const commands = this.ctx.get('commands')
    const userQuestions = this.ctx.get('userQuestions')
    if (
      this.abort.signal.aborted
      || agents === undefined
      || defaultModel === undefined
      || sessions === undefined
      || commands === undefined
      || userQuestions === undefined
    ) return

    const initial = defaultModel.currentSelection()
    const selection: ModelSelectionRef = { current: initial, assembled: undefined }
    this.selection = selection
    const agentOptions = { provider: initial.provider, model: initial.model }
    this.handle = this.resume === ''
      ? await this.createSession(agents, agentOptions)
      : await this.resumeSession(agents, this.resume, agentOptions)
    await this.abandonIfStopped()
    if (this.stopped) return
    this.agent = this.handle.agent
    await this.agent.whenIdle()
    const themeNotice = this.restoreTheme()

    const terminal = internals.createTerminal()
    this.terminal = terminal
    const tui = new TUI(terminal)
    this.tui = tui
    const agent = this.agent
    this.footer.setModel(modelLabel(selection.current))
    void this.preheatContextWindow(selection.current)
    this.sessionHeader = new SessionHeader(agent.id)
    const header = new MeasuredChild(this.sessionHeader)
    const transcript = new MeasuredChild(this.transcript.container)
    this.transcriptMount = transcript
    tui.addChild(header)
    tui.addChild(transcript)
    for (const event of agent.session.events) this.applyEvent(event, true)
    this.wireStats()
    this.wireJobs()

    const editor = new Editor(TUI_EDITOR_THEME)
    editor.setAutocompleteProvider(new SlashAutocomplete(this.listSlashCommands, this.listSlashSkills))
    editor.onSubmit = this.enqueueSubmit
    tui.addChild(new SessionChrome(
      () => terminal.rows,
      () => header.rows + transcript.rows,
      editor,
      this.footer,
    ))
    tui.setFocus(editor)
    tui.addInputListener((data: string) => {
      if (matchesKey(data, 'ctrl+c')) {
        if (this.agent?.status === 'running') {
          this.agent.cancel({ kind: 'user' })
          this.setBusy(false)
          tui.requestRender()
        } else void this.quit(0)
        return { consume: true }
      }
      if (matchesKey(data, 'ctrl+d')) {
        void this.quit(0)
        return { consume: true }
      }
      if (matchesKey(data, 'ctrl+p') || matchesKey(data, 'alt+p')) {
        void this.openModelPicker().catch((error: unknown) => {
          this.notice(error instanceof Error ? error.message : String(error))
        })
        return { consume: true }
      }
      if (matchesKey(data, 'ctrl+o')) {
        this.transcript.toggleLastExpand()
        tui.requestRender()
        return { consume: true }
      }
      if (matchesKey(data, 'alt+o')) {
        this.openDiffOverlay()
        return { consume: true }
      }
      return undefined
    })

    commands.register({
      name: 'help',
      description: 'List slash commands',
      handler: ({ agent: current }) => ({
        kind: 'success' as const,
        text: commands.list(current).map(command => `/${command.name}  ${command.description}`).join('\n'),
      }),
    })
    commands.register({
      name: 'model',
      description: 'Switch the session model',
      handler: async () => {
        await this.openModelPicker()
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'theme',
      description: 'Switch the terminal theme',
      handler: () => {
        this.openThemePicker()
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'settings',
      description: 'Open the settings hub (appearance + models + permission)',
      handler: () => {
        this.openSettingsPicker()
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'login',
      description: 'Log in to a subscription provider',
      input: { hint: 'provider' },
      handler: ({ rawInput }) => {
        void this.startLogin(rawInput.trim()).catch((error: unknown) => {
          this.notice(error instanceof Error ? error.message : String(error))
        })
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'logout',
      description: 'Log out of a subscription provider',
      input: { hint: 'provider' },
      handler: ({ rawInput }) => {
        void this.startLogout(rawInput.trim()).catch((error: unknown) => {
          this.notice(error instanceof Error ? error.message : String(error))
        })
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'auth',
      description: 'Show subscription login status',
      handler: () => this.showAuthStatus(),
    })
    commands.register({
      name: 'sessions',
      description: 'Switch to a persisted session',
      input: { hint: 'session' },
      handler: ({ rawInput }) => {
        void this.startSessions(rawInput.trim()).catch((error: unknown) => {
          this.notice(error instanceof Error ? error.message : String(error))
        })
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'jobs',
      description: 'List this session\'s background jobs',
      handler: () => {
        this.openJobsPicker()
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'preset',
      description: 'Switch the agent preset while the session is blank',
      input: { hint: 'preset' },
      handler: ({ rawInput }) => {
        void this.startPreset(rawInput.trim()).catch((error: unknown) => {
          this.notice(error instanceof Error ? error.message : String(error))
        })
        return { kind: 'success' as const, text: '' }
      },
    })
    commands.register({
      name: 'exit',
      description: 'Exit the terminal UI',
      handler: () => ({ kind: 'success' as const, text: '' }),
    })
    commands.register({
      name: 'quit',
      description: 'Exit the terminal UI',
      handler: () => ({ kind: 'success' as const, text: '' }),
    })
    userQuestions.registerProvider(createQuestionProvider(tui))
    this.ctx.on('approval/request', createApprovalAnswerer(
      tui,
      () => this.agent,
      {
        onOpen: (handle) => {
          this.hideOverlay()
          this.overlay = handle
        },
        onClose: () => { this.overlay = undefined },
      },
    ))
    this.subagents = new SubagentTracker(this.transcript.container, {
      resolveAgent: id => this.ctx.get('agents')?.get(id),
      lookupTool: (name, scoped) => this.ctx.get('tools')?.get(name, scoped ?? this.agent),
      countChanged: (running) => {
        this.subagentRunning = running
        this.footer.setSubagents(running)
        this.terminal?.setTitle(subagentWindowTitle(running))
        this.syncProgress()
        this.tui?.requestRender()
      },
    })
    this.ctx.on('subagent/start', (info) => {
      this.subagents?.start(info)
      this.tui?.requestRender()
    })
    this.ctx.on('subagent/end', (info) => {
      // BEL is a C0 control; ProcessTerminal.setTitle's OSC terminator BEL is not audible.
      if (this.subagents?.end(info) === true) this.terminal?.write('\a')
    })
    this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
      if (session === this.agent?.session) {
        this.applyEvent(event, false)
        return
      }
      if (this.subagents?.sessionEvent(session, event) === true) this.tui?.requestRender()
    })
    this.ctx.on('agent/inbox/inserted', ({ agent: subject, message }) => {
      const owned = this.agent
      if (subject !== owned || message.source.kind !== 'user' || owned.status !== 'running') return
      const kind = owned.inbox.nextStep.some(item => item.id === message.id) ? 'steering' : 'queued'
      this.transcript.showPending(message.id, kind, extractText(message.content))
      if (this.busy) this.showWorking()
      this.tui?.requestRender()
    })
    this.ctx.on('agent/inbox/claimed', ({ agent: subject, message }) => {
      if (subject !== this.agent) return
      this.transcript.dismissPending(message.id)
      this.tui?.requestRender()
    })
    this.ctx.on('agent/inbox/discarded', ({ agent: subject, message }) => {
      if (subject !== this.agent) return
      this.transcript.dismissPending(message.id)
      this.tui?.requestRender()
    })

    this.snapshotProviders()
    this.ctx.on('llm/adapters-updated', () => { void this.onAdaptersUpdated() })
    tui.start()
    terminal.setTitle(subagentWindowTitle(0))
    if (themeNotice !== undefined) this.notice(themeNotice)
    internals.onReady(this)
  }

  /**
   * Forward an editor submit into {@link submit}.
   * @param text - the editor contents.
   */
  private readonly enqueueSubmit = (text: string): void => {
    void this.submit(text)
  }

  /**
   * Live slash catalog for the editor autocomplete provider.
   * @returns the current agent's command descriptors, or none if the session is gone.
   */
  private readonly listSlashCommands = (): readonly CommandDescriptor[] => {
    const agent = this.agent
    const commands = this.ctx.get('commands')
    if (agent === undefined || commands === undefined) return []
    return commands.list(agent)
  }

  /**
   * Live user-invocable skills for slash autocomplete. Missing or failing
   * discovery returns none so command completions still work.
   * @returns kebab-case names and descriptions, or an empty list.
   */
  private readonly listSlashSkills = async (): Promise<readonly SlashSkillItem[]> => {
    const skills = this.ctx.get('skills')
    if (skills === undefined) return []
    const agent = this.agent
    const cwd = agent?.session.header.cwd
    try {
      const listed = await skills.list({
        ...cwd === undefined ? {} : { cwd },
        ...agent === undefined ? {} : { scope: agent },
      })
      return listed.filter(isUserInvocable).map(skill => ({
        name: skill.name,
        description: skill.description,
      }))
    } catch {
      // A failed catalog read is not a typing error; command completions still work.
      return []
    }
  }

  /**
   * Drop a just-created Agent when the fiber stopped during create/resume.
   * @returns whether start should return without opening the TUI.
   */
  private async abandonIfStopped(): Promise<boolean> {
    if (!this.stopped) return false
    await this.disposeHandle()
    return true
  }

  /**
   * Dispose the owned Agent handle and share quiescence with repeat callers.
   */
  private async disposeHandle(): Promise<void> {
    const inFlight = this.handleDisposal
    if (inFlight !== undefined) {
      await inFlight
      return
    }
    const handle = this.handle
    this.handle = undefined
    if (handle === undefined) return
    const disposal = handle.dispose()
    this.handleDisposal = disposal
    try {
      await disposal
    } finally {
      if (this.handleDisposal === disposal) this.handleDisposal = undefined
    }
  }

  /**
   * Handle one submitted editor line: slash commands stay in the command plane.
   * Idle text calls `followup()`; a running Agent receives `steer()` so the
   * line joins the current turn at the next step.
   * @param raw - the exact editor contents.
   */
  async submit(raw: string): Promise<void> {
    const line = raw.trim()
    const agent = this.agent
    const commands = this.ctx.get('commands')
    if (line === '' || agent === undefined || commands === undefined || this.stopped) return
    if (line.startsWith('/')) {
      const parsed = parseCommand(line)
      if (parsed === undefined) {
        this.notice(`unknown command: ${line}`)
        return
      }
      try {
        const execution = await commands.execute(agent, line, this.abort.signal)
        if (execution === undefined) {
          this.notice(`unknown command: /${parsed.name}`)
          return
        }
        if (execution.result.kind === 'error') this.notice(execution.result.text)
        else if (execution.result.text !== undefined && execution.result.text !== '') {
          this.notice(execution.result.text)
        }
        if (parsed.name === 'exit' || parsed.name === 'quit') await this.quit(0)
      } catch (error: unknown) {
        this.notice(`command error: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    this.setBusy(true)
    if (agent.status !== 'running') this.transcript.paintUser(line)
    this.showWorking()
    this.tui?.requestRender()
    try {
      const message = createUserMessage({
        content: [{ type: 'text', text: line }],
        source: { kind: 'user' },
      })
      if (agent.status === 'running') agent.steer(message)
      else agent.followup(message)
    } catch (error: unknown) {
      this.setBusy(false)
      this.notice(`message error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Stop the TUI, drain input, and request process exit.
   * @param code - process exit code.
   */
  async quit(code: number): Promise<void> {
    this.stop()
    if (this.exited) {
      await this.handleDisposal
      return
    }
    this.exited = true
    await this.terminal?.drainInput()
    const agent = this.agent
    if (agent !== undefined) await this.ctx.get('sessions')?.flush(agent.session)
    await this.disposeHandle()
    this.io.exit(code)
  }

  /** Restore the terminal without requesting process exit. */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.abort.abort()
    this.hideOverlay()
    this.hideWorking()
    this.disposeStatsListener?.()
    this.disposeStatsListener = undefined
    this.disposeJobsListener?.()
    this.disposeJobsListener = undefined
    this.terminal?.setProgress(false)
    this.terminal?.setTitle(subagentWindowTitle(0))
    this.tui?.stop()
    this.tui = undefined
  }

  /** Dispose the TUI and await the owned Agent's quiescent teardown. */
  async dispose(): Promise<void> {
    this.stop()
    await this.disposeHandle()
  }

  /**
   * Subscribe to durable session projection changes and push the first stats
   * line. `token-meter` and `session-stats` own the folds; the TUI only reads
   * the consistent snapshot cut.
   */
  private wireStats(): void {
    const projections = this.ctx.get('sessionProjections')
    const agent = this.agent
    if (projections === undefined || agent === undefined) {
      this.refreshStatus()
      return
    }
    const session = agent.session
    this.disposeStatsListener = projections.onChanged((changed: Session) => {
      if (changed !== session) return
      this.refreshStats()
      this.tui?.requestRender()
    })
    this.refreshStats()
  }

  /**
   * Resolve the current selection's context capacity so the footer `ctx`
   * group shows before the first request arrives. The pressure projection
   * only sets `contextWindow` from a `request/context` record, so this
   * preheat fills the gap until the provider reports usage. A resolve that
   * fails or reports no capacity leaves the prior value.
   * @param selection - the live provider/model, or undefined before a selection.
   */
  private async preheatContextWindow(selection: ModelSelection | undefined): Promise<void> {
    if (selection === undefined || this.stopped) return
    const llm = this.ctx.get('llm')
    if (llm === undefined) return
    try {
      const info = await llm.resolveModelInfo(selection.provider, selection.model)
      const resolved = info.context?.contextWindow
      if (resolved !== undefined && !this.stopped) {
        this.preheatedWindow = resolved
        this.refreshStats()
        this.tui?.requestRender()
      }
    } catch {
      // Leave the prior preheat; the request path will populate the projection.
    }
  }

  /**
   * Read one consistent projection cut and push the formatted stats line to
   * the footer. Synchronous and O(1) over the cached log watermark.
   */
  private refreshStats(): void {
    const projections = this.ctx.get('sessionProjections')
    const agent = this.agent
    if (projections === undefined || agent === undefined) return
    const values = projections.snapshot(agent.session).values
    this.footer.setStatsLine(statsLine(
      values.tokenUsage,
      values.contextPressure,
      values.sessionStats,
      this.preheatedWindow,
      values.contextBreakdown,
    ))
    this.refreshStatus()
  }

  /**
   * Subscribe to `ctx.jobs` visible-set changes and paint the first chip cut.
   * The listener is process-wide; {@link refreshStatus} keeps the current Agent.
   */
  private wireJobs(): void {
    const jobs = this.ctx.get('jobs')
    if (jobs === undefined) {
      this.refreshStatus()
      return
    }
    this.disposeJobsListener?.()
    this.disposeJobsListener = jobs.onJobsChanged((owner) => {
      const agent = this.agent
      if (owner !== undefined && owner !== agent) return
      this.refreshStatus()
      this.tui?.requestRender()
    })
    this.refreshStatus()
  }

  /**
   * Push plan / goal / todo / job / preset chips from the current projection
   * cut, `ctx.jobs.list`, and `ctx.agentPresets.composedPreset`. Missing
   * services omit their chip.
   */
  private refreshStatus(): void {
    const agent = this.agent
    const projections = this.ctx.get('sessionProjections')
    const values = agent === undefined || projections === undefined
      ? undefined
      : projections.snapshot(agent.session).values
    const listed = agent === undefined ? [] : this.ctx.get('jobs')?.list(agent) ?? []
    const jobs: JobStatusRow[] = listed.map(job => ({
      id: job.id,
      label: job.label,
      status: job.status,
      ...job.detail === undefined ? {} : { detail: job.detail },
    }))
    const preset = agent === undefined
      ? undefined
      : this.ctx.get('agentPresets')?.composedPreset(agent.ctx)
    this.footer.setStatusLine(formatStatusChips({
      ...values?.plan === undefined ? {} : { plan: values.plan },
      ...values?.goal === undefined || values.goal === null ? {} : {
        goal: { objective: values.goal.goal.objective, phase: values.goal.goal.phase },
      },
      ...values?.todos === undefined || values.todos === null ? {} : { todos: values.todos },
      ...jobs.length === 0 ? {} : { jobs },
      ...preset === undefined ? {} : { preset },
    }))
  }

  /**
   * Overlay of this session's visible jobs. Selecting a row notices its detail.
   */
  private openJobsPicker(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const jobs = this.ctx.get('jobs')
    if (jobs === undefined) {
      this.notice('jobs are not mounted')
      return
    }
    const agent = this.agent
    if (agent === undefined) return
    const rows = jobs.list(agent)
    if (rows.length === 0) {
      this.notice('no jobs in this session')
      return
    }
    const picker = new OverlayPicker(
      'Jobs',
      rows.map(job => jobPickerItem({
        id: job.id,
        label: job.label,
        status: job.status,
        ...job.detail === undefined ? {} : { detail: job.detail },
      })),
      '↑/↓ · Enter detail · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          const selected = rows.find(job => job.id === item.value)
          this.notice(selected === undefined
            ? item.value
            : `${selected.status} · ${selected.label}${selected.detail === undefined ? '' : ` — ${selected.detail}`}`)
        },
        onCancel: () => { this.hideOverlay() },
      },
    )
    this.overlay = showPicker(tui, picker)
  }

  /**
   * Append a notice line that is not a session event.
   * @param text - the notice body.
   */
  notice(text: string): void {
    this.transcript.notice(text)
    this.tui?.requestRender()
  }

  /**
   * Fold one session event into the transcript.
   * @param event - the durable event.
   * @param replay - historical events skip chunks and keep assembled messages.
   */
  applyEvent(event: SessionEvent, replay: boolean): void {
    if (event.type === 'turn/end') this.setBusy(false)
    this.transcript.applyEvent(event, replay)
    if (!replay && this.busy) this.syncWorking(event)
    if (!replay && isStreamChunk(event)) {
      if (this.transcriptMount === undefined) this.tui?.requestRender()
      else this.tui?.requestComponentRender(this.transcriptMount)
      return
    }
    this.tui?.requestRender()
  }

  /**
   * Open `/model`: list registered `ctx.llm` routes. Selecting a model
   * resolves its reasoning efforts and either applies the switch directly or
   * opens a second picker for the effort level; the live selection is then
   * mutated and persisted through `agentDefaultModel.saveSelection`.
   *
   * An instance arrow so `/model` and the model keybinding keep `this` as
   * this app after the command plane invokes the handler.
   */
  openModelPicker = async (): Promise<void> => {
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const llm = this.ctx.get('llm')
      if (llm === undefined) {
        this.notice('no LLM runtime is mounted')
        return
      }
      const rows: { provider: string; model: LlmModelInfo; info: LlmResolvedModelInfo | undefined }[] = []
      for (const provider of llm.listProviders()) {
        const models = await llm.listModels(provider.id)
        for (const model of models) {
          let info: LlmResolvedModelInfo | undefined
          try { info = await llm.resolveModelInfo(provider.id, model.id) } catch { info = undefined }
          rows.push({ provider: provider.id, model, info })
        }
      }
      const items: SelectItem[] = rows.map(row => ({
        value: modelValue(row.provider, row.model.id),
        label: `${row.provider} / ${row.model.id}`,
        description: modelItemDescription(row.model, row.info),
      }))
      if (items.length === 0) {
        this.notice('no LLM providers registered')
        return
      }
      if (!this.canCommitOverlay(operation)) return
      const current = this.selection?.current
      const selectedValue = current === undefined ? undefined : modelValue(current.provider, current.model)
      const picker = new OverlayPicker(
        'Model',
        items,
        '↑/↓ · Enter switch · Esc close',
        {
          onSelect: (item) => {
            this.hideOverlay()
            void this.chooseEffortThenApply(item)
          },
          onCancel: () => { this.hideOverlay() },
        },
        selectedValue,
      )
      this.listingModels = true
      this.overlay = showPicker(operation.tui, picker)
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /** Open `/theme` over builtins and `$DSH_HOME/themes/*.json`. */
  openThemePicker(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const picker = new OverlayPicker(
      'Theme',
      listTuiThemeItems(),
      '↑/↓ · Enter apply · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          void this.applyThemePick(item)
        },
        onCancel: () => { this.hideOverlay() },
      },
      currentTuiThemeId(),
    )
    this.overlay = showPicker(tui, picker)
  }

  /**
   * `/settings`: open the settings hub. A confirmed row opens its sub-panel —
   * Appearance reuses the theme picker; Models lists configurable providers
   * and writes API keys and base URLs; Permission switches the preset through
   * the mounted `ctx.get('permissionPresets')` service; Sections lists
   * `ctx.settings.describe()` read-only; Settings file notices
   * `ctx.settings.documentPath` when the provider stores one local file.
   * Escape or an external hide closes the hub without opening a sub-panel.
   */
  openSettingsPicker(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const settings = this.ctx.get('settings')
    const documentPath = settings?.documentPath
    const sections = typeof settings?.describe === 'function'
    const picker = new OverlayPicker(
      'Settings',
      settingsHubRows({ documentPath, sections }),
      '↑/↓ · Enter open · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          if (item.value === 'theme') this.openThemePicker()
          else if (item.value === 'permission') this.openPermissionPresetPicker()
          else if (item.value === 'inventory') this.openInventoryPicker()
          else if (item.value === 'models') void this.openModelsPicker()
          else if (item.value === 'sections') this.openSettingsSectionsPicker()
          else if (item.value === 'file' && documentPath !== undefined) this.notice(`settings file ${documentPath}`)
        },
        onCancel: () => { this.hideOverlay() },
      },
    )
    this.overlay = showPicker(tui, picker)
  }

  /**
   * Permission sub-panel: switch the preset through the mounted
   * `ctx.get('permissionPresets')` service for the current session. A confirmed preset writes
   * it and notices; the derived `custom` row is a no-op.
   */
  private openPermissionPresetPicker(): void {
    const tui = this.tui
    const agent = this.agent
    if (tui === undefined || agent === undefined) return
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) {
      this.notice('permission presets are not mounted')
      return
    }
    void promptPermissionPreset(tui, presets, agent.session, {
      onOpen: (handle) => {
        this.hideOverlay()
        this.overlay = handle
      },
      onClose: () => { this.overlay = undefined },
    }).then((name) => {
      if (name !== undefined) this.notice(`permission ${name}`)
    })
  }

  /**
   * Inventory sub-panel: a read-only view of the loader's mounted plugin
   * entries (`ctx.get('loader')`). Selecting a row dismisses the view; it
   * changes nothing.
   */
  private openInventoryPicker(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const loader = this.ctx.get('loader')
    if (loader === undefined) {
      this.notice('loader is not mounted')
      return
    }
    const entries: PluginInventoryEntry[] = []
    for (const entry of loader.entries()) {
      entries.push({ id: entry.id, name: entry.options.name, disabled: entry.options.disabled ?? false })
    }
    const picker = new OverlayPicker('Inventory', inventoryRows({ entries: () => entries }), 'Loaded plugins · Esc close', {
      onSelect: () => { this.hideOverlay() },
      onCancel: () => { this.hideOverlay() },
    })
    this.overlay = showPicker(tui, picker)
  }

  /**
   * Sections sub-panel: a read-only view of `ctx.settings.describe()`.
   * Selecting a row notices the namespace and whether a user layer exists;
   * it does not open a schema-driven editor.
   */
  private openSettingsSectionsPicker(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const settings = this.ctx.get('settings')
    if (settings === undefined || typeof settings.describe !== 'function') {
      this.notice('settings are not mounted')
      return
    }
    const entries: SettingsSectionEntry[] = []
    for (const descriptor of settings.describe()) {
      entries.push({
        ns: String(descriptor.ns),
        applies: descriptor.applies,
        overridden: descriptor.user !== undefined,
      })
    }
    if (entries.length === 0) {
      this.notice('no settings sections')
      return
    }
    const picker = new OverlayPicker(
      'Sections',
      settingsSectionRows({ sections: () => entries }),
      'Registered namespaces · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          const selected = entries.find(entry => entry.ns === item.value)
          if (selected === undefined) return
          this.notice(selected.overridden
            ? `settings ${selected.ns} · ${selected.applies} · overridden`
            : `settings ${selected.ns} · ${selected.applies}`)
        },
        onCancel: () => { this.hideOverlay() },
      },
    )
    this.overlay = showPicker(tui, picker)
  }

  /**
   * Models sub-panel: configurable LLM providers from
   * `ctx.get('llm').listConfigurableProviders()`. Each row describes the
   * settings namespace, whether a key is stored, and the profile `baseURL`.
   * Selecting a row opens Set / Clear API key, Set / Clear base URL, and
   * Login; writes go through `ctx.credentials` and `ctx.settings.mutate`.
   */
  private async openModelsPicker(): Promise<void> {
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const llm = this.ctx.get('llm')
      if (llm === undefined) {
        this.notice('no LLM runtime is mounted')
        return
      }
      const settings = this.ctx.get('settings')
      const credentials = this.ctx.get('credentials')
      const providers: ModelsProviderEntry[] = []
      for (const provider of llm.listConfigurableProviders()) {
        const path = provider.settingsPath ?? []
        const section = settings?.get(settingsNamespace(provider.settingsNs))
        const baseURL = section === undefined ? undefined : baseUrlOf(section, path)
        const ref = this.providerKeyRef({
          provider: provider.provider,
          displayName: provider.displayName,
          settingsNs: provider.settingsNs,
          settingsPath: provider.settingsPath,
        })
        let keyConfigured = false
        if (credentials !== undefined && ref !== undefined) {
          try {
            keyConfigured = (await credentials.describe(credentialRef(ref))).configured
          } catch {
            // Leave the key mark off; the roster still lists the provider.
          }
        }
        providers.push({
          provider: provider.provider,
          displayName: provider.displayName,
          settingsNs: provider.settingsNs,
          settingsPath: provider.settingsPath,
          ...baseURL === undefined ? {} : { baseURL },
          ...keyConfigured ? { keyConfigured: true } : {},
        })
      }
      if (!this.canCommitOverlay(operation)) return
      const picker = new OverlayPicker('Models', modelsRows({ providers: () => providers }), 'Configurable LLM providers · Esc close', {
        onSelect: (item) => {
          this.hideOverlay()
          const selected = providers.find(entry => entry.provider === item.value)
          if (selected !== undefined) {
            void this.openProviderActions(selected).catch((error: unknown) => {
              this.notice(error instanceof Error ? error.message : String(error))
            })
          }
        },
        onCancel: () => { this.hideOverlay() },
      })
      this.overlay = showPicker(operation.tui, picker)
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /**
   * Overlay of Set / Clear API key, Set / Clear base URL, and Login for one
   * configurable provider.
   * @param provider - the roster row that was confirmed.
   */
  private async openProviderActions(provider: ModelsProviderEntry): Promise<void> {
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const credentials = this.ctx.get('credentials')
      const ref = this.providerKeyRef(provider)
      let canClear = false
      if (credentials !== undefined && ref !== undefined) {
        try {
          const info = await credentials.describe(credentialRef(ref))
          canClear = info.configured && info.writable
        } catch {
          // A describe failure leaves Clear hidden; Set and Login still work.
        }
      }
      const settings = this.ctx.get('settings')
      const canClearBaseUrl = settings !== undefined
        && baseUrlOf(settings.get(settingsNamespace(provider.settingsNs)), provider.settingsPath ?? []) !== undefined
      const canLogin = this.ctx.get('llmOAuth')?.loginableProviders()
        .some(candidate => candidate.id === provider.provider) ?? false
      if (!this.canCommitOverlay(operation)) return
      const picker = new OverlayPicker(
        provider.displayName,
        providerCredentialRows({ canClear, canClearBaseUrl, canLogin }),
        '↑/↓ · Enter · Esc close',
        {
          onSelect: (item) => {
            this.hideOverlay()
            if (item.value === 'set-key') void this.promptProviderKey(provider)
            else if (item.value === 'clear-key') void this.clearProviderKey(provider)
            else if (item.value === 'set-url') void this.promptProviderBaseUrl(provider)
            else if (item.value === 'clear-url') void this.clearProviderBaseUrl(provider)
            else if (item.value === 'login') void this.startLogin(provider.provider)
          },
          onCancel: () => { this.hideOverlay() },
        },
      )
      this.overlay = showPicker(operation.tui, picker)
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /**
   * Prompt for a secret API key and store it through credentials + settings.
   * @param provider - the roster row being edited.
   */
  private async promptProviderKey(provider: ModelsProviderEntry): Promise<void> {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const form = new LoginTextForm(`API key for ${provider.displayName}`, 'paste key', true)
    this.overlay = tui.showOverlay(form, { anchor: 'bottom-center', width: '90%', maxHeight: '40%' })
    try {
      const draft = await form.wait(this.abort.signal)
      const refusal = apiKeyRefusal(draft)
      if (refusal !== undefined) {
        this.notice(refusal)
        return
      }
      await this.storeProviderKey(provider, draft.trim())
      this.notice(`API key stored for ${provider.displayName}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== LOGIN_CANCELLED) this.notice(message)
    } finally {
      this.hideOverlay()
    }
  }

  /**
   * Remove the stored key for this provider's credential reference.
   * @param provider - the roster row being cleared.
   */
  private async clearProviderKey(provider: ModelsProviderEntry): Promise<void> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      this.notice('credentials are not mounted')
      return
    }
    const ref = this.providerKeyRef(provider)
    if (ref === undefined) {
      this.notice(`no API key reference for ${provider.displayName}`)
      return
    }
    try {
      await credentials.unset(credentialRef(ref))
      this.notice(`API key cleared for ${provider.displayName}`)
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Prompt for a base URL and store it through `ctx.settings.mutate`.
   * @param provider - the roster row being edited.
   */
  private async promptProviderBaseUrl(provider: ModelsProviderEntry): Promise<void> {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const form = new LoginTextForm(`Base URL for ${provider.displayName}`, 'https://…', false)
    this.overlay = tui.showOverlay(form, { anchor: 'bottom-center', width: '90%', maxHeight: '40%' })
    try {
      const draft = await form.wait(this.abort.signal)
      const refusal = baseUrlRefusal(draft)
      if (refusal !== undefined) {
        this.notice(refusal)
        return
      }
      await this.storeProviderBaseUrl(provider, draft.trim())
      this.notice(`base URL stored for ${provider.displayName}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== LOGIN_CANCELLED) this.notice(message)
    } finally {
      this.hideOverlay()
    }
  }

  /**
   * Remove the stored `baseURL` so the catalog endpoint wins again.
   * @param provider - the roster row being cleared.
   */
  private async clearProviderBaseUrl(provider: ModelsProviderEntry): Promise<void> {
    const settings = this.ctx.get('settings')
    if (settings === undefined) {
      this.notice('settings are not mounted')
      return
    }
    try {
      await settings.mutate(settingsNamespace(provider.settingsNs), [
        { op: 'unset', path: [...provider.settingsPath ?? [], 'baseURL'] },
      ])
      this.notice(`base URL cleared for ${provider.displayName}`)
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Write `baseURL` on the stored profile.
   * @param provider - the roster row being edited.
   * @param value - the trimmed endpoint.
   */
  private async storeProviderBaseUrl(provider: ModelsProviderEntry, value: string): Promise<void> {
    const settings = this.ctx.get('settings')
    if (settings === undefined) {
      throw new Error('settings are not mounted')
    }
    await settings.mutate(settingsNamespace(provider.settingsNs), [
      { op: 'set', path: [...provider.settingsPath ?? [], 'baseURL'], value },
    ])
  }

  /**
   * Write `apiKeyEnv` when the profile names none, then store the secret.
   * @param provider - the roster row being edited.
   * @param value - the trimmed key.
   */
  private async storeProviderKey(provider: ModelsProviderEntry, value: string): Promise<void> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      throw new Error('credentials are not mounted')
    }
    const path = provider.settingsPath ?? []
    const settings = this.ctx.get('settings')
    const named = settings === undefined
      ? undefined
      : apiKeyEnvOf(settings.get(settingsNamespace(provider.settingsNs)), path)
    const ref = named ?? deriveKeyRef(provider.provider)
    if (settings !== undefined && named === undefined) {
      await settings.mutate(settingsNamespace(provider.settingsNs), [
        { op: 'set', path: [...path, 'apiKeyEnv'], value: ref },
      ])
    }
    await credentials.set(credentialRef(ref), value)
  }

  /**
   * The credential reference this provider's profile names, or the derivation.
   * @param provider - the roster row.
   * @returns a POSIX identifier, or undefined when settings is absent and no derivation applies.
   */
  private providerKeyRef(provider: ModelsProviderEntry): string | undefined {
    const settings = this.ctx.get('settings')
    if (settings !== undefined) {
      const named = apiKeyEnvOf(
        settings.get(settingsNamespace(provider.settingsNs)),
        provider.settingsPath ?? [],
      )
      if (named !== undefined) return named
    }
    return deriveKeyRef(provider.provider)
  }

  /**
   * `/login [provider]`: pick a loginable catalog provider when omitted, then
   * run `ctx.llmOAuth.login` with the overlay `AuthInteraction`.
   * @param provider - a catalog provider id, or empty to open the picker.
   */
  async startLogin(provider: string): Promise<void> {
    const oauth = this.requireOAuth()
    if (oauth === undefined) return
    if (provider.length > 0) {
      await this.runLogin(oauth, provider)
      return
    }
    this.openLoginPicker(oauth)
  }

  /**
   * `/logout [provider]`: pick a stored credential when omitted, then delete it.
   * @param provider - a stored provider id, or empty to open the picker.
   */
  async startLogout(provider: string): Promise<void> {
    const oauth = this.requireOAuth()
    if (oauth === undefined) return
    if (provider.length > 0) {
      await this.runLogout(oauth, provider)
      return
    }
    await this.openLogoutPicker(oauth)
  }

  /**
   * `/auth`: notice stored vs loginable subscription status.
   * @returns a success result whose text the command plane notices.
   */
  async showAuthStatus(): Promise<{ kind: 'success' | 'error'; text: string }> {
    const oauth = this.ctx.get('llmOAuth')
    if (oauth === undefined) {
      return { kind: 'error', text: 'subscription login is not mounted' }
    }
    const stored = new Set((await oauth.list()).map(entry => entry.providerId))
    return { kind: 'success', text: formatAuthStatus(oauth.loginableProviders(), stored) }
  }

  /**
   * `/sessions [id]`: pick a top-level session (this cwd first, then other
   * recorded cwds) when omitted, then resume it in-process. The current
   * session is flushed only after the next agent is live. The process cwd
   * does not change.
   * @param sessionId - a persisted session id, or empty to open the picker.
   */
  async startSessions(sessionId: string): Promise<void> {
    if (sessionId.length > 0) {
      await this.switchSession(sessionId)
      return
    }
    await this.openSessionPicker()
  }

  /**
   * Overlay of switchable sessions from `ctx.sessionQuery`.
   */
  private async openSessionPicker(): Promise<void> {
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const query = this.ctx.get('sessionQuery')
      if (query === undefined) {
        this.notice('session listing is not mounted')
        return
      }
      const entries = await this.listSwitchableSessions(query)
      if (entries.length === 0) {
        this.notice('no sessions')
        return
      }
      if (!this.canCommitOverlay(operation)) return
      const currentId = this.agent?.id
      const picker = new OverlayPicker(
        'Sessions',
        entries.map(entry => sessionPickerItem(entry, currentId)),
        '↑/↓ · Enter switch · Esc close',
        {
          onSelect: (item) => {
            this.hideOverlay()
            void this.switchSession(item.value)
          },
          onCancel: () => { this.hideOverlay() },
        },
        currentId,
      )
      this.overlay = showPicker(operation.tui, picker)
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /**
   * Top-level sessions across recorded cwds, this process cwd first, with
   * folded titles when cheap.
   * @param query - the mounted session-query service.
   * @returns picker rows, always including the live session when it is switchable.
   */
  private async listSwitchableSessions(query: SessionQueryEngine): Promise<SessionPickerEntry[]> {
    const records = await query.filterSessions([
      { kind: 'parent', values: [null] },
    ])
    const current = this.agent
    const listed = new Map<string, SessionRecord>()
    for (const record of records) {
      if (!isSwitchableSession(record.header)) continue
      listed.set(record.header.id, record)
    }
    if (current !== undefined && isSwitchableSession(current.session.header)) {
      listed.set(current.id, {
        header: current.session.header,
        live: true,
        persisted: listed.get(current.id)?.persisted ?? false,
      })
    }
    const rows = [...listed.values()]
    const titles = await this.foldSessionTitles(query, rows.map(record => record.header.id))
    return sortSessionPickerEntries(rows.map((record) => {
      const title = titles.get(record.header.id)
      return {
        id: record.header.id,
        header: record.header,
        ...title === undefined ? {} : { title },
      }
    }), process.cwd())
  }

  /**
   * Fold titles for the picker; a failed batch leaves every row untitled.
   * @param query - the mounted session-query service.
   * @param ids - session ids in picker order.
   * @returns id → title for successful folds.
   */
  private async foldSessionTitles(
    query: SessionQueryEngine,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const titles = new Map<string, string>()
    if (ids.length === 0) return titles
    let results: SessionTitleObservationResult[]
    try {
      results = await query.readTitleSnapshots(ids.map(id => SessionId(id)))
    } catch {
      // Listing still works without titles when the corpus read fails.
      return titles
    }
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const title = result.value.title?.title
      if (title !== undefined) titles.set(result.sessionId, title)
    }
    return titles
  }

  /**
   * Create a fresh session. The default preset is resolved before create so
   * `meta.agentPreset` is snapshotted with the header.
   * @param agents - the mounted agent factory.
   * @param agentOptions - the live model selection.
   */
  private async createSession(
    agents: { create(options: CreateAgentOptions): Promise<AgentHandle> },
    agentOptions: { provider: string; model: string },
  ): Promise<AgentHandle> {
    const presets = this.ctx.get('agentPresets')
    const presetId = presets === undefined ? undefined : (await presets.resolve()).id
    return await agents.create({
      sessionId: SessionId(`session-${randomUUID()}`),
      meta: {
        cwd: process.cwd(),
        ...presetId === undefined ? {} : { agentPreset: presetId },
      },
      agentOptions,
      setup: agentCtx => this.installAgentWorld(agentCtx, presetId),
    })
  }

  /**
   * Resume a persisted session under the preset its log records.
   * @param agents - the mounted agent factory.
   * @param sessionId - persisted session id.
   * @param agentOptions - the live model selection, when any.
   */
  private async resumeSession(
    agents: { resume(options: {
      resumeSessionId: ReturnType<typeof SessionId>
      agentOptions?: { provider: string; model: string }
      setup?: (agentCtx: Context) => void | Promise<void>
    }): Promise<AgentHandle> },
    sessionId: string,
    agentOptions?: { provider: string; model: string },
  ): Promise<AgentHandle> {
    return await agents.resume({
      resumeSessionId: SessionId(sessionId),
      ...agentOptions === undefined ? {} : { agentOptions },
      setup: (agentCtx) => {
        const recorded = agentCtx.agent === undefined
          ? undefined
          : resolveSessionPreset(agentCtx.agent.session)
        return this.installAgentWorld(agentCtx, recorded)
      },
    })
  }

  /**
   * Install the live model selection and, when a roster is mounted, join the
   * agent to a standing preset. Missing `ctx.agentPresets` leaves the host
   * composition in place.
   * @param agentCtx - the unpublished agent scope.
   * @param presetId - the preset to mount, or undefined for the roster default.
   */
  private async installAgentWorld(agentCtx: Context, presetId?: string): Promise<void> {
    if (this.selection !== undefined) installModelSelection(agentCtx, this.selection)
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return
    await presets.mount(agentCtx, presetId)
  }

  /**
   * `/preset [id]`: pick a mountable preset when omitted, then recompose the
   * live agent while the session is still blank.
   * @param presetId - a roster id, or empty to open the picker.
   */
  async startPreset(presetId: string): Promise<void> {
    if (presetId.length > 0) {
      await this.applyPreset(presetId)
      return
    }
    await this.openPresetPicker()
  }

  /**
   * Overlay of mountable presets from `ctx.agentPresets.list()`.
   */
  private async openPresetPicker(): Promise<void> {
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const presets = this.ctx.get('agentPresets')
      if (presets === undefined) {
        this.notice('agent presets are not mounted')
        return
      }
      const listed = await presets.list()
      if (listed.length === 0) {
        this.notice('no agent presets')
        return
      }
      if (!this.canCommitOverlay(operation)) return
      const current = this.agent === undefined ? undefined : presets.composedPreset(this.agent.ctx)
      const picker = new OverlayPicker(
        'Agent preset',
        listed.map(preset => presetPickerItem(preset, current)),
        '↑/↓ · Enter switch · Esc close',
        {
          onSelect: (item) => {
            this.hideOverlay()
            void this.applyPreset(item.value)
          },
          onCancel: () => { this.hideOverlay() },
        },
        current,
      )
      this.overlay = showPicker(operation.tui, picker)
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /**
   * Recompose the live agent and append `agent-preset/selected`. A started
   * conversation is locked; a broken or unknown id notices without writing.
   * @param presetId - the roster id to compose.
   */
  private async applyPreset(presetId: string): Promise<void> {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) {
      this.notice('agent presets are not mounted')
      return
    }
    const agent = this.agent
    if (agent === undefined) return
    if (!sessionBlank(agent.session)) {
      this.notice('this session has already started; its agent preset is fixed')
      return
    }
    const found = (await presets.list()).find(preset => preset.id === presetId)
    if (found?.broken !== undefined) {
      this.notice(`preset ${presetId} is broken: ${found.broken}`)
      return
    }
    try {
      const preset = await presets.recompose(agent.ctx, presetId)
      agent.session.append('agent-preset/selected', { agentPreset: preset.id })
      this.refreshStatus()
      this.notice(`preset ${preset.id}`)
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Resume `id` in-process. Resume first so a failure leaves the current Agent.
   * @param id - persisted session id.
   */
  private async switchSession(id: string): Promise<void> {
    if (this.agent?.id === id) return
    if (this.agent?.status === 'running') {
      this.notice('finish the current turn before switching sessions')
      return
    }
    const agents = this.ctx.get('agents')
    if (agents === undefined) {
      this.notice('no agent registry is mounted')
      return
    }
    const current = this.selection?.current
    let next: AgentHandle
    try {
      next = await this.resumeSession(agents, id, current === undefined
        ? undefined
        : { provider: current.provider, model: current.model })
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
      return
    }
    const previous = this.handle
    this.handle = next
    this.agent = next.agent
    await next.agent.whenIdle()
    this.hideWorking()
    this.setBusy(false)
    this.subagents?.reset()
    this.disposeStatsListener?.()
    this.disposeStatsListener = undefined
    this.transcript.reset()
    this.sessionHeader?.setSessionId(next.agent.id)
    for (const event of next.agent.session.events) this.applyEvent(event, true)
    this.wireStats()
    this.footer.setModel(modelLabel(this.selection?.current))
    void this.preheatContextWindow(this.selection?.current)
    this.notice(`session ${next.agent.id}`)
    this.tui?.requestRender()
    if (previous !== undefined) {
      try {
        await this.ctx.get('sessions')?.flush(previous.agent.session)
      } catch (error: unknown) {
        this.notice(error instanceof Error ? error.message : String(error))
      }
      await previous.dispose()
    }
  }

  /** Resolve `ctx.llmOAuth` or notice that the store is absent. */
  private requireOAuth(): LlmOAuthService | undefined {
    const oauth = this.ctx.get('llmOAuth')
    if (oauth === undefined) {
      this.notice('subscription login is not mounted')
      return undefined
    }
    return oauth
  }

  /**
   * Overlay of loginable catalog providers.
   * @param oauth - the mounted store.
   */
  private openLoginPicker(oauth: LlmOAuthService): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const candidates = oauth.loginableProviders()
    if (candidates.length === 0) {
      this.notice('no subscription login providers')
      return
    }
    const picker = new OverlayPicker(
      'Log in',
      candidates.map(candidate => ({
        value: candidate.id,
        label: candidate.loginLabel ?? candidate.name,
        description: candidate.id,
      })),
      '↑/↓ · Enter start · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          void this.runLogin(oauth, item.value)
        },
        onCancel: () => { this.hideOverlay() },
      },
    )
    this.overlay = showPicker(tui, picker)
  }

  /**
   * Overlay of stored credentials.
   * @param oauth - the mounted store.
   */
  private async openLogoutPicker(oauth: LlmOAuthService): Promise<void> {
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const stored = await oauth.list()
      if (stored.length === 0) {
        this.notice('no subscription logins')
        return
      }
      if (!this.canCommitOverlay(operation)) return
      const names = new Map(oauth.loginableProviders().map(candidate => [candidate.id, candidate.name]))
      const picker = new OverlayPicker(
        'Log out',
        stored.map(entry => ({
          value: entry.providerId,
          label: names.get(entry.providerId) ?? entry.providerId,
        })),
        '↑/↓ · Enter logout · Esc close',
        {
          onSelect: (item) => {
            this.hideOverlay()
            void this.runLogout(oauth, item.value)
          },
          onCancel: () => { this.hideOverlay() },
        },
      )
      this.overlay = showPicker(operation.tui, picker)
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /**
   * Run one provider's OAuth flow through the overlay interaction.
   * @param oauth - the mounted store.
   * @param provider - catalog provider id.
   */
  private async runLogin(oauth: LlmOAuthService, provider: string): Promise<void> {
    const tui = this.tui
    if (tui === undefined) return
    const interaction = createTuiAuthInteraction(tui, {
      onOpen: (handle) => {
        this.hideOverlay()
        this.overlay = handle
      },
      onClose: () => { this.overlay = undefined },
      onNotice: (text) => { this.notice(text) },
    }, this.abort.signal)
    try {
      await oauth.login(provider, interaction)
      this.notice(`logged in to ${provider}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== LOGIN_CANCELLED) this.notice(message)
    } finally {
      this.hideOverlay()
    }
  }

  /**
   * Delete one stored credential.
   * @param oauth - the mounted store.
   * @param provider - stored provider id.
   */
  private async runLogout(oauth: LlmOAuthService, provider: string): Promise<void> {
    try {
      await oauth.logout(provider)
      this.notice(`logged out of ${provider}`)
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Open the last `card: 'diff'` tool card as a fullscreen overlay. Mouse
   * tracking is on for that overlay's lifetime so the wheel scrolls the hunks.
   */
  openDiffOverlay(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined || this.overlayOpening) return
    const view = this.transcript.lastDiff()
    if (view === undefined) {
      this.notice('no file diff to open')
      return
    }
    const overlay = new DiffOverlay(
      view.title,
      view.diffs,
      () => tui.terminal.rows,
      { onClose: () => { this.hideOverlay() } },
    )
    this.overlay = showDiffOverlay(tui, overlay)
  }

  /**
   * Toggle the running-turn chrome: footer hint, Thinking loader, and progress.
   * @param busy - true while the Agent is running a turn.
   */
  private setBusy(busy: boolean): void {
    this.busy = busy
    this.footer.setBusy(busy)
    if (!busy) this.hideWorking()
    this.syncProgress()
  }

  /** OSC progress is on while this turn or a subagent run is live. */
  private syncProgress(): void {
    this.terminal?.setProgress(this.busy || this.subagentRunning > 0)
  }

  /**
   * Keep a braille loader at the transcript tail while the model is silent or a
   * tool is running. Streaming tokens replace it; a tool result brings Thinking back.
   * @param event - the live session event that just folded into the transcript.
   */
  private syncWorking(event: SessionEvent): void {
    if (event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (
        (chunk.type === 'reasoning-delta' || chunk.type === 'text-delta')
        && chunk.text !== ''
      ) this.hideWorking()
      return
    }
    if (event.type === 'tool/call') {
      this.showWorking(this.transcript.pendingWorkLabel() ?? event.data.name)
      return
    }
    if (
      event.type === 'tool/result'
      || event.type === 'user/message'
      || event.type === 'step/start'
    ) this.showWorking()
  }

  /**
   * Mount or refresh the working loader as the last transcript child.
   * @param message - `Thinking` while the model is silent; the live tool title while a call runs.
   */
  private showWorking(message = 'Thinking'): void {
    const tui = this.tui
    if (tui === undefined || this.stopped) return
    if (this.working === undefined) {
      this.working = new Loader(
        tui,
        text => fg(TUI_COLOR.accent, text),
        text => fg(TUI_COLOR.dim, text),
        message,
        TUI_SYMBOL_THEME.spinnerFrames,
      )
      this.transcript.container.addChild(this.working)
      return
    }
    this.working.setMessage(message)
    this.transcript.container.removeChild(this.working)
    this.transcript.container.addChild(this.working)
  }

  /** Stop the Thinking loader. Idempotent. */
  private hideWorking(): void {
    const loader = this.working
    if (loader === undefined) return
    this.working = undefined
    loader.stop()
    this.transcript.container.removeChild(loader)
    loader.dispose()
  }

  /** Reserve one async overlay operation until it publishes or is invalidated. */
  private readonly beginOverlayOperation = (): OverlayOperation | undefined => {
    const tui = this.tui
    if (tui === undefined || this.stopped || this.overlay !== undefined || this.overlayOpening) return undefined
    this.overlayOpening = true
    return { tui, generation: ++this.overlayGeneration }
  }

  /** Whether an async overlay may still publish into its captured renderer. */
  private readonly canCommitOverlay = (operation: OverlayOperation): boolean => {
    return !this.stopped
      && this.tui === operation.tui
      && this.overlay === undefined
      && this.overlayOpening
      && this.overlayGeneration === operation.generation
  }

  /** Release the async reservation after an operation settles. */
  private readonly finishOverlayOperation = (operation: OverlayOperation): void => {
    if (this.overlayGeneration === operation.generation) this.overlayOpening = false
  }

  /** Invalidate pending overlay work when the focused surface changes. */
  private readonly invalidateOverlayOperation = (): void => {
    this.overlayOpening = false
    this.overlayGeneration += 1
  }

  private hideOverlay(): void {
    this.invalidateOverlayOperation()
    this.overlay?.hide()
    this.overlay = undefined
    this.listingModels = false
    this.tui?.requestRender()
  }

  /** Record the current `ctx.llm` provider ids so later additions can notice. */
  private snapshotProviders(): void {
    const ids = this.ctx.get('llm')?.listProviders().map(provider => provider.id) ?? []
    this.knownProviders = new Set(ids)
  }

  /**
   * Rebuild an open `/model` picker after a topology commit, and notice
   * newly registered provider ids when the picker is closed.
   */
  private async onAdaptersUpdated(): Promise<void> {
    if (this.stopped) return
    const llm = this.ctx.get('llm')
    const next = new Set(llm?.listProviders().map(provider => provider.id) ?? [])
    const added = [...next].filter(id => !this.knownProviders.has(id)).sort()
    const removed = [...this.knownProviders].filter(id => !next.has(id)).sort()
    this.knownProviders = next
    if (this.listingModels) {
      this.hideOverlay()
      await this.openModelPicker()
      return
    }
    if (added.length > 0) this.notice(`${added.join(', ')} available — /model`)
    const current = this.selection?.current?.provider
    if (current !== undefined && removed.includes(current)) {
      this.notice(`${current} is no longer available`)
    }
  }

  /**
   * Apply a `/theme` confirmation to the live palette, transcript paint, and settings.
   * @param item - the picker row whose value is a builtin id or custom stem.
   */
  private async applyThemePick(item: SelectItem): Promise<void> {
    try {
      if (!applyTuiTheme(item.value)) {
        this.notice(`unknown theme: ${item.value}`)
        return
      }
    } catch (error: unknown) {
      this.notice(error instanceof Error ? error.message : String(error))
      return
    }
    this.transcript.container.invalidate()
    this.tui?.requestRender()
    await this.ctx.get('settings')?.replace(TUI_THEME_SETTINGS_NAMESPACE, { theme: item.value })
    this.notice(`theme ${item.value}`)
  }

  /**
   * Resolve the picked model's reasoning efforts and either apply the switch
   * directly (a model with no selectable efforts) or open a second picker for
   * the effort level. A model whose efforts cannot be resolved — an unreachable
   * provider or an adapter that cannot describe this exact route — is applied
   * without an effort, and the request path refuses if it is unsupported.
   * @param item - the picker row whose value is `provider\0model`.
   */
  private async chooseEffortThenApply(item: SelectItem): Promise<void> {
    const parsed = parseModelValue(item.value)
    if (parsed === undefined || this.selection === undefined) return
    const operation = this.beginOverlayOperation()
    if (operation === undefined) return
    try {
      const llm = this.ctx.get('llm')
      let efforts: readonly LlmReasoningEffortInfo[] | undefined
      let defaultEffort: ReasoningEffortId | undefined
      if (llm !== undefined) {
        try {
          const info = await llm.resolveModelInfo(parsed.provider, parsed.model)
          if (info.reasoning !== undefined && info.reasoning.efforts.length > 0) {
            efforts = info.reasoning.efforts
            defaultEffort = info.reasoning.defaultEffort
          }
        } catch {
          // Apply without an effort; the request path refuses if unsupported.
        }
      }
      if (!this.canCommitOverlay(operation)) return
      if (efforts === undefined || efforts.length === 0) {
        await this.applyModelSelection({ provider: parsed.provider, model: parsed.model })
        return
      }
      const current = this.selection.current
      const currentEffort = current !== undefined
        && current.provider === parsed.provider && current.model === parsed.model
        ? current.reasoningEffort : undefined
      this.openEffortPicker(operation, parsed, efforts, currentEffort ?? defaultEffort)
    } finally {
      this.finishOverlayOperation(operation)
    }
  }

  /**
   * Open the second-step effort picker for a just-confirmed model. Escape
   * cancels the whole switch, leaving the prior selection untouched.
   * @param parsed - the provider/model the model picker confirmed.
   * @param efforts - the model's selectable reasoning efforts, in display order.
   * @param preselected - the effort id to highlight, when any.
   */
  private openEffortPicker(
    operation: OverlayOperation,
    parsed: { provider: string; model: string },
    efforts: readonly LlmReasoningEffortInfo[],
    preselected: ReasoningEffortId | undefined,
  ): void {
    if (!this.canCommitOverlay(operation)) return
    const items: SelectItem[] = efforts.map(effort => ({
      value: String(effort.id),
      label: effort.name,
      ...effort.description === undefined ? {} : { description: effort.description },
    }))
    const picker = new OverlayPicker(
      'Effort',
      items,
      '↑/↓ · Enter apply · Esc cancel',
      {
        onSelect: (effortItem) => {
          this.hideOverlay()
          void this.applyModelSelection({
            provider: parsed.provider,
            model: parsed.model,
            reasoningEffort: ReasoningEffortId(effortItem.value),
          })
        },
        onCancel: () => { this.hideOverlay() },
      },
      preselected === undefined ? undefined : String(preselected),
    )
    this.overlay = showPicker(operation.tui, picker)
  }

  /**
   * Apply a complete model selection to the live selection, footer, and
   * settings. Unlike a raw `parseModelValue` result, `next` carries the effort
   * the picker chose, so a switch no longer drops a previously stored effort.
   * @param next - the resolved provider, model, and optional reasoning effort.
   */
  private async applyModelSelection(next: ModelSelection): Promise<void> {
    if (this.selection === undefined || this.stopped) return
    this.selection.current = next
    this.footer.setModel(modelLabel(next))
    void this.preheatContextWindow(next)
    this.tui?.requestRender()
    await this.ctx.get('agentDefaultModel')?.saveSelection(next)
    const effort = next.reasoningEffort === undefined ? '' : ` · ${String(next.reasoningEffort)}`
    this.notice(`model ${next.provider} / ${next.model}${effort}`)
  }

  /**
   * Load the resolved `/theme` id before the first paint. Unknown or invalid
   * ids leave the live palette unchanged and return notice text.
   * @returns a notice when the saved id cannot be applied, otherwise undefined.
   */
  private restoreTheme(): string | undefined {
    const id = this.themeSource().theme
    try {
      if (!applyTuiTheme(id)) return `unknown theme: ${id}`
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error)
    }
    return undefined
  }
}

/** Live assistant deltas repaint only the transcript subtree. */
function isStreamChunk(event: SessionEvent): boolean {
  if (event.type !== 'assistant/chunk') return false
  const chunk = event.data.chunk
  return chunk.type === 'text-delta' || chunk.type === 'reasoning-delta'
}

function modelValue(provider: string, model: string): string {
  return `${provider}\0${model}`
}

function parseModelValue(value: string): { provider: string; model: string } | undefined {
  const split = value.indexOf('\0')
  if (split <= 0 || split === value.length - 1) return undefined
  return { provider: value.slice(0, split), model: value.slice(split + 1) }
}

function modelLabel(selection: { provider: string; model: string; reasoningEffort?: ReasoningEffortId } | undefined): string {
  if (selection === undefined) return ''
  const base = `${selection.provider} / ${selection.model}`
  return selection.reasoningEffort === undefined ? base : `${base} · ${String(selection.reasoningEffort)}`
}

/** Compact one-line capacity/metadata descriptor for a `/model` picker row. */
function modelItemDescription(
  model: LlmModelInfo,
  resolved: LlmResolvedModelInfo | undefined,
): string {
  const parts: string[] = [model.name]
  const ctx = resolved?.context?.contextWindow
  if (ctx !== undefined) parts.push(`ctx ${compactTokens(ctx)}`)
  if (resolved?.defaultMaxTokens !== undefined) parts.push(`out ${compactTokens(resolved.defaultMaxTokens)}`)
  if (resolved?.reasoning?.defaultEffort !== undefined) parts.push(`effort ${String(resolved.reasoning.defaultEffort)}`)
  if (model.inputModalities !== undefined && model.inputModalities.length > 0) {
    parts.push(model.inputModalities.join('/'))
  }
  return parts.join(' · ')
}

/** Compact K/M token count for inline picker descriptors. */
function compactTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${n >= 100_000 ? String(Math.round(n / 1_000)) : String(Math.round(n / 100) / 10)}K`
  return `${String(Math.round(n / 100_000) / 10)}M`
}
