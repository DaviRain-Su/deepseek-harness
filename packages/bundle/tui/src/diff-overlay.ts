/**
 * Fullscreen scrollable diff overlay: Alt+O opens the last `card: 'diff'`
 * tool card so the complete change is readable with mouse wheel.
 * @module @deepseek-ai/dsh-tui/diff-overlay
 */

import {
  Ellipsis,
  matchesKey,
  routeSgrMouseInput,
  ScrollView,
  truncateToWidth,
  type Component,
  type OverlayHandle,
  type TUI,
} from '@oh-my-pi/pi-tui'
import type { FileDiff } from '@deepseek-ai/dsh-tools'
import { diffBody, paintDiffLine } from './diff.ts'
import { bold, fg, TUI_COLOR } from './theme.ts'

/** Callbacks for one overlay session. */
export interface DiffOverlayCallbacks {
  /** Escape, Ctrl+O, or Alt+O dismissed the overlay. */
  onClose: () => void
}

/**
 * Title + scrollable colored diff + footer hint, shown through `tui.showOverlay`.
 */
export class DiffOverlay implements Component {
  private readonly scroll: ScrollView
  private readonly onClose: () => void

  /**
   * @param title - accent heading above the viewport.
   * @param diffs - the hunks to paint.
   * @param rows - live TTY rows; the viewport keeps a title row and a hint row.
   * @param callbacks - dismiss handler.
   */
  constructor(
    private readonly title: string,
    private readonly diffs: readonly FileDiff[],
    private readonly rows: () => number,
    callbacks: DiffOverlayCallbacks,
  ) {
    this.scroll = new ScrollView([], {
      height: 8,
      scrollbar: 'auto',
      ellipsis: Ellipsis.Omit,
    })
    this.onClose = callbacks.onClose
  }

  /**
   * @param width - columns available to this overlay.
   * @returns heading, viewport, and hint rows.
   */
  render(width: number): string[] {
    const painted = diffBody(this.diffs).map((line) => {
      const clipped = width < 1 ? line : truncateToWidth(line, width)
      return paintDiffLine(clipped, line)
    })
    this.scroll.setLines(painted)
    this.scroll.setHeight(Math.max(1, this.rows() - 3))
    return [
      bold(fg(TUI_COLOR.accent, this.title)),
      ...this.scroll.render(width),
      fg(TUI_COLOR.dim, '↑/↓ scroll · click wheel · esc close'),
    ]
  }

  /**
   * Scroll, or dismiss on Escape / Ctrl+O / Alt+O. Fullscreen mouse tracking
   * delivers wheel events here.
   * @param data - raw terminal input.
   */
  handleInput(data: string): void {
    if (
      matchesKey(data, 'escape')
      || matchesKey(data, 'ctrl+c')
      || matchesKey(data, 'ctrl+o')
      || matchesKey(data, 'alt+o')
    ) {
      this.onClose()
      return
    }
    if (this.scroll.handleScrollKey(data)) return
    routeSgrMouseInput(data, (event) => {
      if (event.wheel === null) return false
      this.scroll.scroll(event.wheel)
      return true
    })
  }

  /** Drop viewport caches. */
  invalidate(): void {
    this.scroll.invalidate()
  }
}

/**
 * Show a fullscreen diff overlay so pointer events reach {@link DiffOverlay}.
 * @param tui - the live renderer.
 * @param overlay - the overlay component.
 * @returns the handle whose `hide` the caller must invoke on close.
 */
export function showDiffOverlay(tui: TUI, overlay: DiffOverlay): OverlayHandle {
  return tui.showOverlay(overlay, { fullscreen: true, width: '100%', height: '100%' })
}
