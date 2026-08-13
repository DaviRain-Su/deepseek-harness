/**
 * Session chrome: a Pi-style header above the transcript and a two-line footer.
 * @module @deepseek-ai/dsh-tui/chrome
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'
import { truncateToWidth, visibleWidth, type Component } from '@earendil-works/pi-tui'
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
  constructor(private readonly sessionId: string) {}

  /**
   * @param width - columns available to this component.
   * @returns wrapped header rows plus a trailing blank separator.
   */
  render(width: number): string[] {
    const logo = bold(fg(TUI_COLOR.accent, 'dsh'))
    const hints = ['ctrl+c interrupt', '/ commands', '/exit exit'].join(fg(TUI_COLOR.muted, ' · '))
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
   * @param model - the live `provider / model` label.
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * @param busy - true while the Agent is running a turn.
   */
  setBusy(busy: boolean): void {
    this.busy = busy
  }

  /**
   * @param width - columns available to this component.
   * @returns cwd on the first row and the stats/model row on the second.
   */
  render(width: number): string[] {
    const ellipsis = fg(TUI_COLOR.dim, '...')
    const pwd = truncateToWidth(fg(TUI_COLOR.dim, formatCwdForFooter(this.cwd, this.home)), width, ellipsis)
    const left = this.busy ? fg(TUI_COLOR.dim, 'ctrl+c cancel') : ''
    const right = fg(TUI_COLOR.dim, this.model)
    return [pwd, alignPair(left, right, width, ellipsis)]
  }

  /** No cached rows. */
  invalidate(): void {}
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

function alignPair(left: string, right: string, width: number, ellipsis: string): string {
  if (left === '') {
    const shown = truncateToWidth(right, width, ellipsis)
    return `${' '.repeat(width - visibleWidth(shown))}${shown}`
  }
  const leftWidth = visibleWidth(left)
  if (leftWidth + 2 >= width) return truncateToWidth(left, width, ellipsis)
  const shownRight = truncateToWidth(right, width - leftWidth - 2, '')
  return `${left}${' '.repeat(width - leftWidth - visibleWidth(shownRight))}${shownRight}`
}

/**
 * Resolve the process home directory from the environment.
 * @param env - `HOME` and `USERPROFILE` as Node exposes them.
 * @returns the first defined home path, or undefined when neither is set.
 */
export function homeDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.HOME ?? env.USERPROFILE
}
