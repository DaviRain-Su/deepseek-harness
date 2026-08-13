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
import type { Agent, AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { parseCommand } from '@deepseek-ai/dsh-commands'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { SlashAutocomplete } from './autocomplete.ts'
import { MeasuredChild, SessionChrome, SessionFooter, SessionHeader, subagentWindowTitle } from './chrome.ts'
import { DiffOverlay, showDiffOverlay } from './diff-overlay.ts'
import { OverlayPicker, showPicker } from './picker.ts'
import { createQuestionProvider } from './questions.ts'
import { SubagentTracker } from './subagents.ts'
import {
  applyTuiTheme,
  currentTuiThemeId,
  fg,
  listTuiThemes,
  TUI_COLOR,
  TUI_EDITOR_THEME,
  TUI_SYMBOL_THEME,
} from './theme.ts'
import { TranscriptView, extractText } from './transcript.ts'

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
  private overlay: OverlayHandle | undefined
  private readonly transcript = new TranscriptView(name => this.ctx.get('tools')?.get(name, this.agent))
  private transcriptMount: MeasuredChild | undefined
  private readonly footer = new SessionFooter(process.cwd(), '')
  private working: Loader | undefined
  private busy = false
  private subagentRunning = 0
  private stopped = false
  private exited = false

  /**
   * @param ctx - plugin context carrying core services and the launcher exit hook.
   * @param resume - persisted session id; empty creates a fresh session.
   * @param io - process-facing effects.
   */
  constructor(
    private readonly ctx: Context,
    private readonly resume: string,
    private readonly io: TuiIo,
  ) {}

  /**
   * Settle the Loader, create or resume the Agent, and start the TUI.
   */
  async start(): Promise<void> {
    await this.ctx.get('loader')?.await()
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
    const setup = (agentCtx: Context): void => {
      installModelSelection(agentCtx, selection)
    }
    const agentOptions = { provider: initial.provider, model: initial.model }
    this.handle = this.resume === ''
      ? await agents.create({
        sessionId: SessionId(`session-${randomUUID()}`),
        meta: { cwd: process.cwd() },
        agentOptions,
        setup,
      })
      : await agents.resume({
        resumeSessionId: SessionId(this.resume),
        agentOptions,
        setup,
      })
    await this.abandonIfStopped()
    if (this.stopped) return
    this.agent = this.handle.agent
    await this.agent.whenIdle()

    const terminal = internals.createTerminal()
    this.terminal = terminal
    const tui = new TUI(terminal)
    this.tui = tui
    const agent = this.agent
    this.footer.setModel(modelLabel(selection.current))
    const header = new MeasuredChild(new SessionHeader(agent.id))
    const transcript = new MeasuredChild(this.transcript.container)
    this.transcriptMount = transcript
    tui.addChild(header)
    tui.addChild(transcript)
    for (const event of agent.session.events) this.applyEvent(event, true)

    const editor = new Editor(TUI_EDITOR_THEME)
    editor.setAutocompleteProvider(new SlashAutocomplete(this.listSlashCommands))
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
        void this.openModelPicker()
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
      handler: () => {
        void this.openModelPicker()
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
    const tracker = new SubagentTracker(this.transcript.container, {
      resolveAgent: id => this.ctx.get('agents')?.get(id),
      lookupTool: (name, scoped) => this.ctx.get('tools')?.get(name, scoped ?? agent),
      countChanged: (running) => {
        this.subagentRunning = running
        this.footer.setSubagents(running)
        this.terminal?.setTitle(subagentWindowTitle(running))
        this.syncProgress()
        this.tui?.requestRender()
      },
    })
    this.ctx.on('subagent/start', (info) => {
      tracker.start(info)
      this.tui?.requestRender()
    })
    this.ctx.on('subagent/end', (info) => {
      // BEL is a C0 control; ProcessTerminal.setTitle's OSC terminator BEL is not audible.
      if (tracker.end(info)) this.terminal?.write('\a')
    })
    this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
      if (session === this.agent?.session) {
        this.applyEvent(event, false)
        return
      }
      if (tracker.sessionEvent(session, event)) this.tui?.requestRender()
    })
    this.ctx.on('agent/inbox/inserted', ({ agent: subject, message }) => {
      if (subject !== agent || message.source.kind !== 'user' || agent.status !== 'running') return
      const kind = agent.inbox.nextStep.some(item => item.id === message.id) ? 'steering' : 'queued'
      this.transcript.showPending(message.id, kind, extractText(message.content))
      if (this.busy) this.showWorking()
      this.tui?.requestRender()
    })
    this.ctx.on('agent/inbox/claimed', ({ agent: subject, message }) => {
      if (subject !== agent) return
      this.transcript.dismissPending(message.id)
      this.tui?.requestRender()
    })
    this.ctx.on('agent/inbox/discarded', ({ agent: subject, message }) => {
      if (subject !== agent) return
      this.transcript.dismissPending(message.id)
      this.tui?.requestRender()
    })

    tui.start()
    terminal.setTitle(subagentWindowTitle(0))
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
   * Drop a just-created Agent when the fiber stopped during create/resume.
   * @returns whether start should return without opening the TUI.
   */
  private async abandonIfStopped(): Promise<boolean> {
    if (!this.stopped) return false
    await this.disposeHandle()
    return true
  }

  /**
   * Dispose the in-flight Agent handle after an abort during create/resume.
   */
  private async disposeHandle(): Promise<void> {
    const handle = this.handle
    this.handle = undefined
    if (handle === undefined) return
    await handle.dispose()
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
    const message = createUserMessage({
      content: [{ type: 'text', text: line }],
      source: { kind: 'user' },
    })
    if (agent.status === 'running') agent.steer(message)
    else agent.followup(message)
  }

  /**
   * Stop the TUI, drain input, and request process exit.
   * @param code - process exit code.
   */
  async quit(code: number): Promise<void> {
    this.stop()
    if (this.exited) return
    this.exited = true
    await this.terminal?.drainInput()
    const agent = this.agent
    if (agent !== undefined) await this.ctx.get('sessions')?.flush(agent.session)
    this.io.exit(code)
  }

  /** Restore the terminal without requesting process exit (fiber disposal). */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.abort.abort()
    this.hideOverlay()
    this.hideWorking()
    this.terminal?.setProgress(false)
    this.terminal?.setTitle(subagentWindowTitle(0))
    this.tui?.stop()
    this.tui = undefined
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
   * Open `/model`: list registered `ctx.llm` routes, then mutate the live
   * selection and persist it through `agentDefaultModel.saveSelection`.
   */
  async openModelPicker(): Promise<void> {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined) return
    const llm = this.ctx.get('llm')
    if (llm === undefined) {
      this.notice('no LLM runtime is mounted')
      return
    }
    const items: SelectItem[] = []
    for (const provider of llm.listProviders()) {
      const models = await llm.listModels(provider.id)
      for (const model of models) items.push(modelItem(provider.id, model))
    }
    if (items.length === 0) {
      this.notice('no LLM providers registered')
      return
    }
    const current = this.selection?.current
    const selectedValue = current === undefined ? undefined : modelValue(current.provider, current.model)
    const picker = new OverlayPicker(
      'Model',
      items,
      '↑/↓ · Enter switch · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          void this.applyModelPick(item)
        },
        onCancel: () => { this.hideOverlay() },
      },
      selectedValue,
    )
    this.overlay = showPicker(tui, picker)
  }

  /** Open `/theme` over the built-in palette set. */
  openThemePicker(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined) return
    const items = listTuiThemes().map(id => ({ value: id, label: id }))
    const picker = new OverlayPicker(
      'Theme',
      items,
      '↑/↓ · Enter apply · Esc close',
      {
        onSelect: (item) => {
          this.hideOverlay()
          if (!applyTuiTheme(item.value)) {
            this.notice(`unknown theme: ${item.value}`)
            return
          }
          this.notice(`theme ${item.value}`)
        },
        onCancel: () => { this.hideOverlay() },
      },
      currentTuiThemeId(),
    )
    this.overlay = showPicker(tui, picker)
  }

  /**
   * Open the last `card: 'diff'` tool card as a fullscreen overlay. Mouse
   * tracking is on for that overlay's lifetime so the wheel scrolls the hunks.
   */
  openDiffOverlay(): void {
    const tui = this.tui
    if (tui === undefined || this.overlay !== undefined) return
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
   * Keep a braille Thinking loader at the transcript tail while the model is
   * silent. Tokens and pending tool cards replace it; tool results bring it back.
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
      this.hideWorking()
      return
    }
    if (
      event.type === 'tool/result'
      || event.type === 'user/message'
      || event.type === 'step/start'
    ) this.showWorking()
  }

  /** Mount or refresh the Thinking loader as the last transcript child. */
  private showWorking(): void {
    const tui = this.tui
    if (tui === undefined || this.stopped) return
    if (this.working === undefined) {
      this.working = new Loader(
        tui,
        text => fg(TUI_COLOR.accent, text),
        text => fg(TUI_COLOR.dim, text),
        'Thinking',
        TUI_SYMBOL_THEME.spinnerFrames,
      )
      this.transcript.container.addChild(this.working)
      return
    }
    this.working.setMessage('Thinking')
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

  private hideOverlay(): void {
    this.overlay?.hide()
    this.overlay = undefined
    this.tui?.requestRender()
  }

  /**
   * Apply a `/model` confirmation to the live selection, footer, and settings.
   * @param item - the picker row whose value is `provider\\0model`.
   */
  private async applyModelPick(item: SelectItem): Promise<void> {
    const parsed = parseModelValue(item.value)
    if (parsed === undefined || this.selection === undefined) return
    this.selection.current = parsed
    this.footer.setModel(modelLabel(parsed))
    this.tui?.requestRender()
    await this.ctx.get('agentDefaultModel')?.saveSelection(parsed)
    this.notice(`model ${parsed.provider} / ${parsed.model}`)
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

function modelLabel(selection: { provider: string; model: string } | undefined): string {
  if (selection === undefined) return ''
  return `${selection.provider} / ${selection.model}`
}

function modelItem(provider: string, model: LlmModelInfo): SelectItem {
  return {
    value: modelValue(provider, model.id),
    label: `${provider} / ${model.id}`,
    description: model.name,
  }
}
