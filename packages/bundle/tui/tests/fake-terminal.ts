/**
 * In-memory {@link Terminal} for TUI tests: captures writes and replays input.
 */

import type { Terminal } from '@earendil-works/pi-tui'

/** Captured TTY used by TuiMainScreen in package tests. */
export class FakeTerminal implements Terminal {
  /** Bytes written by the renderer. */
  output = ''
  private onInput: ((data: string) => void) | undefined
  private onResize: (() => void) | undefined
  private started = false
  kittyProtocolActive = false

  constructor(
    readonly columns = 80,
    readonly rows = 24,
  ) {}

  /**
   * Begin delivering input and resize callbacks.
   * @param onInput - key sequence handler.
   * @param onResize - dimension-change handler.
   */
  start(onInput: (data: string) => void, onResize: () => void): void {
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
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(_title: string): void {}
  setProgress(_active: boolean): void {}
}
