/**
 * Chat blocks: a Pi user-message bubble, a dim Thinking body, and a streaming
 * assistant Markdown answer.
 * @module @deepseek-ai/dsh-tui/messages
 */

import { Box, Markdown, type Component } from '@oh-my-pi/pi-tui'
import { bg, fg, italic, TUI_COLOR, TUI_MARKDOWN_THEME } from './theme.ts'
import { wrapLine } from './wrap.ts'

/**
 * User turn: Pi's padded `Box` with `userMessageBg` around Markdown whose
 * default color is `userMessageText`. No `You` label and no OSC-133 wrappers.
 */
export class UserMessageBlock implements Component {
  private readonly box: Box

  /**
   * @param text - the visible user message body.
   */
  constructor(text: string) {
    this.box = new Box(1, 1, line => bg(TUI_COLOR.userMessageBg, line))
    this.box.addChild(new Markdown(text, 0, 0, TUI_MARKDOWN_THEME, {
      color: content => fg(TUI_COLOR.userMessageText, content),
    }))
  }

  /**
   * @param width - columns available to this component.
   * @returns the background bubble plus a trailing blank row.
   */
  render(width: number): string[] {
    return [...this.box.render(width), '']
  }

  /** Drop the Box and Markdown width caches. */
  invalidate(): void {
    this.box.invalidate()
  }
}

/**
 * Assistant turn: one Markdown component with Pi's output pad, updated in
 * place while tokens stream.
 */
export class AssistantMessageBlock implements Component {
  private text: string
  private readonly markdown: Markdown

  /**
   * @param text - the current visible assistant body.
   */
  constructor(text: string) {
    this.text = text
    this.markdown = new Markdown(text, 1, 0, TUI_MARKDOWN_THEME)
  }

  /**
   * Append a streamed delta and refresh the Markdown body.
   * @param delta - the next text-delta chunk.
   */
  append(delta: string): void {
    this.text += delta
    this.markdown.setText(this.text)
  }

  /**
   * @param width - columns available to this component.
   * @returns wrapped Markdown rows plus a trailing blank row.
   */
  render(width: number): string[] {
    return [...this.markdown.render(width), '']
  }

  /** Drop Markdown's width cache. */
  invalidate(): void {
    this.markdown.invalidate()
  }
}

/**
 * Assistant reasoning: a dim italic "Thinking" label and the streamed body,
 * distinct from the Markdown answer that follows.
 */
export class ThinkingBlock implements Component {
  private text: string

  /**
   * @param text - the current reasoning body.
   */
  constructor(text: string) {
    this.text = text
  }

  /**
   * Append a streamed reasoning delta.
   * @param delta - the next reasoning-delta chunk.
   */
  append(delta: string): void {
    this.text += delta
  }

  /**
   * @param width - columns available to this component.
   * @returns the label, wrapped body, and a trailing blank row.
   */
  render(width: number): string[] {
    const paint = (line: string) => fg(TUI_COLOR.dim, italic(line))
    return [
      ...wrapLine('Thinking', width).map(paint),
      ...wrapLine(this.text, width).map(paint),
      '',
    ]
  }

  /** No cached rows. */
  invalidate(): void {}
}
