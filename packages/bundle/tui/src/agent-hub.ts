/**
 * Fullscreen scrollable transcript overlay for one subagent run: Alt+A opens
 * the Agent Hub roster, and selecting a run opens this overlay, which replays
 * the child session's log and keeps folding live events while open.
 * @module @deepseek-ai/dsh-tui/agent-hub
 */

import {
  Ellipsis,
  matchesKey,
  routeSgrMouseInput,
  ScrollView,
  type Component,
  type OverlayHandle,
  type TUI,
} from '@oh-my-pi/pi-tui'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { TranscriptView, type ToolLookup } from './transcript.ts'
import { bold, fg, TUI_COLOR } from './theme.ts'

/** Callbacks for one overlay session. */
export interface AgentTranscriptOverlayCallbacks {
  /** Escape, Ctrl+C, or Alt+A dismissed the overlay. */
  onClose: () => void
}

/**
 * Title + scrollable live transcript + footer hint, shown through
 * `tui.showOverlay`. The supplied events replay on construction;
 * {@link applyEvent} folds live events while the overlay is open.
 */
export class AgentTranscriptOverlay implements Component {
  private readonly scroll: ScrollView
  private readonly view: TranscriptView
  private readonly onClose: () => void

  /**
   * @param label - the run's descriptor label, shown as the accent heading.
   * @param events - the child session's events to replay (live snapshot or a
   *   persistence inspection for a cold child).
   * @param lookup - tool definition resolver scoped to the child agent.
   * @param rows - live TTY rows; the viewport keeps a title row and a hint row.
   * @param callbacks - dismiss handler.
   */
  constructor(
    private readonly label: string,
    events: readonly SessionEvent[],
    lookup: ToolLookup,
    private readonly rows: () => number,
    callbacks: AgentTranscriptOverlayCallbacks,
  ) {
    this.view = new TranscriptView(lookup)
    for (const event of events) this.view.applyEvent(event, true)
    this.scroll = new ScrollView([], { height: 8, scrollbar: 'auto', ellipsis: Ellipsis.Omit })
    this.onClose = callbacks.onClose
  }

  /**
   * Fold one live child session event into the transcript.
   * @param event - the durable event the app's `session/event` listener routed.
   */
  applyEvent(event: SessionEvent): void {
    this.view.applyEvent(event, false)
  }

  /**
   * @param width - columns available to this overlay.
   * @returns heading, viewport, and hint rows.
   */
  render(width: number): string[] {
    this.scroll.setLines(this.view.container.render(width))
    this.scroll.setHeight(Math.max(1, this.rows() - 3))
    return [
      bold(fg(TUI_COLOR.accent, this.label)),
      ...this.scroll.render(width),
      fg(TUI_COLOR.dim, '↑/↓ scroll · click wheel · esc close'),
    ]
  }

  /**
   * Scroll, or dismiss on Escape / Ctrl+C / Alt+A. Fullscreen mouse tracking
   * delivers wheel events here.
   * @param data - raw terminal input.
   */
  handleInput(data: string): void {
    if (
      matchesKey(data, 'escape')
      || matchesKey(data, 'ctrl+c')
      || matchesKey(data, 'alt+a')
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
 * Show a fullscreen subagent transcript overlay so pointer events reach it.
 * @param tui - the live renderer.
 * @param overlay - the overlay component.
 * @returns the handle whose `hide` the caller must invoke on close.
 */
export function showAgentTranscriptOverlay(tui: TUI, overlay: AgentTranscriptOverlay): OverlayHandle {
  return tui.showOverlay(overlay, { fullscreen: true, width: '100%', maxHeight: '100%' })
}
