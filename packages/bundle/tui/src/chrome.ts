/**
 * Session chrome: a Pi-style header above the transcript, and an editor plus
 * two-line footer pinned to the bottom of the TTY until the transcript fills
 * the viewport.
 * @module @deepseek-ai/dsh-tui/chrome
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Ellipsis, truncateToWidth, visibleWidth, type Component } from '@oh-my-pi/pi-tui'
import { bold, fg, TUI_COLOR } from './theme.ts'
import { wrapLine } from './wrap.ts'

/**
 * Accent product name, compact key hints, and a dim session id, each wrapped
 * to the terminal width. Cwd and model live on {@link SessionFooter}.
 */
export class SessionHeader implements Component {
  /**
   * @param sessionId - the persisted Agent session id shown on the last row.
   */
  constructor(private sessionId: string) {}

  /**
   * Replace the dim session id after an in-process `/sessions` switch.
   * @param sessionId - the newly live Agent session id.
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }

  /**
   * @param width - columns available to this component.
   * @returns wrapped header rows plus a trailing blank separator.
   */
  render(width: number): string[] {
    const logo = bold(fg(TUI_COLOR.accent, 'dsh'))
    const hints = ['ctrl+c interrupt', 'ctrl+o expand', 'alt+o diff', '/model', '/login', '/sessions', '/theme', '/exit'].join(fg(TUI_COLOR.muted, ' · '))
    const onboarding = fg(TUI_COLOR.dim, 'Ask dsh to inspect or edit this workspace.')
    const session = fg(TUI_COLOR.dim, `session ${this.sessionId}`)
    return [
      ...wrapLine(logo, width),
      ...wrapLine(hints, width),
      ...wrapLine(onboarding, width),
      ...wrapLine(session, width),
      '',
    ]
  }

  /** No cached rows. */
  invalidate(): void {}
}

/**
 * Two-line status under the editor: dim cwd, then a running hint on the left
 * and the model on the right, matching Pi's footer density.
 */
export class SessionFooter implements Component {
  private busy = false
  private subagents = 0
  private statsLine = ''

  /**
   * @param cwd - the process working directory; home is replaced with `~`.
   * @param model - `provider / model` from the current default selection.
   * @param home - `HOME` / `USERPROFILE`; omitted when the process has neither.
   */
  constructor(
    private readonly cwd: string,
    private model: string,
    private readonly home: string | undefined = homeDir(),
  ) {}

  /**
   * Replace the footer model label after `/model` or the initial selection.
   * @param model - the live `provider / model` label.
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * Toggle the running-turn hint on the stats row (`enter append · ctrl+c cancel`).
   * @param busy - true while the Agent is running a turn.
   */
  setBusy(busy: boolean): void {
    this.busy = busy
  }

  /**
   * Replace the running-subagent count on the stats row; zero hides it.
   * @param running - subagent runs started but not yet settled.
   */
  setSubagents(running: number): void {
    this.subagents = running
  }

  /**
   * Replace the durable stats line (cache hit, token totals, throughput,
   * context occupancy). An empty string hides the row, so the footer stays
   * two rows until the first billed turn reports usage.
   * @param line - the formatted stats line, or '' to hide it.
   */
  setStatsLine(line: string): void {
    this.statsLine = line
  }

  /**
   * Paint cwd on the first row, the durable stats line on the second when
   * present, and the stats/model row on the last.
   * @param width - columns available to this component.
   * @returns cwd, optional stats line, and the stats/model row.
   */
  render(width: number): string[] {
    const pwd = truncateToWidth(fg(TUI_COLOR.dim, formatCwdForFooter(this.cwd, this.home)), width, Ellipsis.Ascii)
    const running = runningSubagentsLabel(this.subagents)
    const hints = [
      ...this.busy ? ['enter append', 'ctrl+c cancel'] : [],
      ...running === undefined ? [] : [running],
    ].join(' · ')
    const left = hints === '' ? '' : fg(TUI_COLOR.dim, hints)
    const right = fg(TUI_COLOR.dim, this.model)
    const rows = [pwd]
    if (this.statsLine !== '') rows.push(truncateToWidth(fg(TUI_COLOR.dim, this.statsLine), width, Ellipsis.Ascii))
    rows.push(alignPair(left, right, width))
    return rows
  }

  /** No cached rows. */
  invalidate(): void {}
}

/**
 * Forwards every Component method to `inner` and stores the last render's row
 * count so {@link SessionChrome} can pad to the TTY height without rendering
 * that sibling a second time. `children` is `[inner]` so pi-tui focus and
 * scoped renders still walk the wrapped tree.
 */
export class MeasuredChild implements Component {
  /** Last `inner.render` row count; 0 before the first render. */
  rows = 0
  /** The wrapped component, for pi-tui subtree walks. */
  readonly children: Component[]

  /**
   * @param inner - header or transcript rendered above {@link SessionChrome}.
   */
  constructor(private readonly inner: Component) {
    this.children = [inner]
  }

  /**
   * @param width - columns available to `inner`.
   * @returns `inner`'s rows unchanged.
   */
  render(width: number): string[] | readonly string[] {
    const lines = this.inner.render(width)
    this.rows = lines.length
    return lines
  }

  /**
   * @param ignore - forwarded to `inner` when it implements the hook.
   */
  setIgnoreTight(ignore: boolean): void {
    this.inner.setIgnoreTight?.(ignore)
  }

  /** Drop `inner` caches. */
  invalidate(): void {
    this.inner.invalidate?.()
  }

  /** Tear down `inner`. */
  dispose(): void {
    this.inner.dispose?.()
  }
}

/**
 * Empty rows, then the editor, then the footer: the remainder of the TTY
 * below the header and transcript. pi-tui top-aligns a frame shorter than the
 * viewport, so this pad keeps the prompt on the last rows until the
 * transcript grows past that height.
 */
export class SessionChrome implements Component {
  /** Editor then footer, for pi-tui focus and scoped renders. */
  readonly children: Component[]

  /**
   * @param rows - live TTY height (`terminal.rows`).
   * @param above - header plus transcript row count from this frame's earlier
   *   {@link MeasuredChild} renders.
   * @param editor - the focused prompt.
   * @param footer - cwd and model status under the prompt.
   */
  constructor(
    private readonly rows: () => number,
    private readonly above: () => number,
    private readonly editor: Component,
    private readonly footer: Component,
  ) {
    this.children = [editor, footer]
  }

  /**
   * @param width - columns available to the editor and footer.
   * @returns blank pad rows (possibly none), then editor rows, then footer rows.
   */
  render(width: number): string[] {
    const editor = this.editor.render(width)
    const footer = this.footer.render(width)
    const fill = Math.max(0, this.rows() - this.above() - editor.length - footer.length)
    const lines: string[] = []
    for (let i = 0; i < fill; i++) lines.push('')
    lines.push(...editor)
    lines.push(...footer)
    return lines
  }

  /**
   * @param ignore - forwarded to editor and footer when they implement the hook.
   */
  setIgnoreTight(ignore: boolean): void {
    this.editor.setIgnoreTight?.(ignore)
    this.footer.setIgnoreTight?.(ignore)
  }

  /** Drop editor and footer caches. */
  invalidate(): void {
    this.editor.invalidate?.()
    this.footer.invalidate?.()
  }

  /** Tear down editor and footer. */
  dispose(): void {
    this.editor.dispose?.()
    this.footer.dispose?.()
  }
}

/**
 * Replace `home` with `~` when `cwd` is inside it, matching Pi's footer path.
 * @param cwd - the absolute working directory.
 * @param home - the user's home directory, or undefined when unknown.
 * @returns `cwd`, or a `~/…` form when `cwd` is under `home`.
 */
export function formatCwdForFooter(cwd: string, home: string | undefined): string {
  if (home === undefined) return cwd
  const resolvedCwd = resolve(cwd)
  const resolvedHome = resolve(home)
  const relativeToHome = relative(resolvedHome, resolvedCwd)
  if (!isCwdInsideHome(relativeToHome)) return cwd
  return relativeToHome === '' ? '~' : `~${sep}${relativeToHome}`
}

/**
 * Whether `path.relative(home, cwd)` names a path inside home, including the
 * Windows case where a different drive yields an absolute relative string.
 * @param relativeToHome - `path.relative` of home → cwd.
 * @returns true when cwd is home or a descendant of home.
 */
export function isCwdInsideHome(relativeToHome: string): boolean {
  return relativeToHome === ''
    || (relativeToHome !== '..'
      && !relativeToHome.startsWith(`..${sep}`)
      && !isAbsolute(relativeToHome))
}

function alignPair(left: string, right: string, width: number): string {
  if (left === '') {
    const shown = truncateToWidth(right, width, Ellipsis.Ascii)
    return `${' '.repeat(width - visibleWidth(shown))}${shown}`
  }
  const leftWidth = visibleWidth(left)
  if (leftWidth + 2 >= width) return truncateToWidth(left, width, Ellipsis.Ascii)
  const shownRight = truncateToWidth(right, width - leftWidth - 2, '')
  return `${left}${' '.repeat(width - leftWidth - visibleWidth(shownRight))}${shownRight}`
}

/**
 * Footer / window-title fragment for live subagent runs. Zero hides it.
 * @param running - runs started but not yet settled.
 * @returns `<n> subagent(s) running`, or undefined when idle.
 */
export function runningSubagentsLabel(running: number): string | undefined {
  if (running <= 0) return undefined
  return `${String(running)} subagent${running === 1 ? '' : 's'} running`
}

/**
 * OSC window title for the TUI process. Idle sessions stay `dsh`; live runs
 * prefix the same count the footer shows.
 * @param running - runs started but not yet settled.
 * @returns the title string passed to the terminal `setTitle` call.
 */
export function subagentWindowTitle(running: number): string {
  const label = runningSubagentsLabel(running)
  return label === undefined ? 'dsh' : `dsh · ${label}`
}

/**
 * Resolve the process home directory from the environment.
 * @param env - `HOME` and `USERPROFILE` as Node exposes them.
 * @returns the first defined home path, or undefined when neither is set.
 */
export function homeDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.HOME ?? env.USERPROFILE
}
