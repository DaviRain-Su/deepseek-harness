/**
 * In-memory {@link Terminal} for TUI tests: captures writes and replays input.
 */

import type { Terminal, TerminalAppearance } from '@oh-my-pi/pi-tui'

/** Captured TTY used by TUI in package tests. */
export class FakeTerminal implements Terminal {
  /** Bytes written by the renderer. */
  output = ''
  private onInput: ((data: string) => void) | undefined
  private onResize: (() => void) | undefined
  private started = false
  kittyProtocolActive = false
  kittyEnableSequence: string | null = null
  appearance: TerminalAppearance | undefined
  /** Last {@link Terminal.setTitle} value. */
  title = ''
  /** Last {@link Terminal.setProgress} value. */
  progress = false

  constructor(
    readonly columns = 80,
    readonly rows = 24,
  ) {}

  /**
   * Begin delivering input and resize callbacks.
   * @param onInput - key sequence handler.
   * @param onResize - dimension-change handler.
   * @param _onDisconnect - unused; the fake never disconnects.
   */
  start(onInput: (data: string) => void, onResize: () => void, _onDisconnect?: () => void): void {
    this.started = true
    this.onInput = onInput
    this.onResize = onResize
  }

  /** Restore captured callbacks. */
  stop(): void {
    this.started = false
    this.onInput = undefined
    this.onResize = undefined
  }

  /**
   * No-op drain; the fake never holds a real stdin buffer.
   * @returns a resolved promise.
   */
  async drainInput(): Promise<void> {}

  /**
   * Record renderer output.
   * @param data - ANSI or text written by pi-tui.
   */
  write(data: string): void {
    this.output += data
  }

  /**
   * Deliver one input sequence as if typed.
   * @param data - raw terminal input.
   */
  type(data: string): void {
    this.onInput?.(data)
  }

  /** Fire the resize callback recorded at {@link start}. */
  resize(): void {
    this.onResize?.()
  }

  /** Whether {@link start} has been called and {@link stop} has not. */
  get isStarted(): boolean {
    return this.started
  }

  moveBy(_lines: number): void {}
  hideCursor(_force?: boolean): void {}
  showCursor(_force?: boolean): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  /**
   * Record the OSC window title.
   * @param title - the string the TUI would send.
   */
  setTitle(title: string): void {
    this.title = title
  }

  /**
   * Record the progress-indicator request.
   * @param active - whether a live run should show progress.
   */
  setProgress(active: boolean): void {
    this.progress = active
  }
  onAppearanceChange(
    _callback: (appearance: TerminalAppearance) => void,
  ): void {}
}
