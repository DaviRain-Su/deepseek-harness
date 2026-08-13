/**
 * Overlay form that answers one {@link AskUserQuestionItem} through the TUI.
 * @module @deepseek-ai/dsh-tui/questions
 */

import type { Component, TUI } from '@oh-my-pi/pi-tui'
import { matchesKey } from '@oh-my-pi/pi-tui'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type {
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequest,
  UserQuestionProvider,
} from '@deepseek-ai/dsh-user-questions'
import { bold, fg, TUI_COLOR, TUI_SELECT_LIST_THEME } from './theme.ts'
import { wrapLine } from './wrap.ts'

/** Select-list theme shared with the editor autocomplete overlay. */
export const QUESTION_LIST_THEME = TUI_SELECT_LIST_THEME

/**
 * Collects one answer from keyboard input: numbered options, optional
 * multi-select toggles, or free text when the question has no options.
 */
export class QuestionForm implements Component {
  private readonly selected = new Set<string>()
  private draft = ''
  private done: ((answer: AskUserQuestionAnswerItem) => void) | undefined
  private fail: ((error: UserQuestionError) => void) | undefined

  /**
   * @param question - the item to present.
   */
  constructor(private readonly question: AskUserQuestionItem) {}

  /**
   * Wait until the user confirms or the signal aborts.
   * @param signal - the owning ask() abort signal.
   * @returns the structured answer for this question id.
   */
  wait(signal?: AbortSignal): Promise<AskUserQuestionAnswerItem> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED'))
        return
      }
      this.done = resolve
      this.fail = reject
      const onAbort = (): void => {
        signal?.removeEventListener('abort', onAbort)
        this.fail?.(new UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * Render the question, optional detail, and the current selection or draft.
   * @param width - columns available to this overlay.
   * @returns one string per row, each no wider than `width`.
   */
  render(width: number): string[] {
    const options = this.question.options ?? []
    const lines = [
      ...wrapLine(bold(fg(TUI_COLOR.accent, this.question.question)), width),
      ...this.question.detail === undefined ? [] : wrapLine(fg(TUI_COLOR.muted, this.question.detail), width),
    ]
    if (options.length === 0) {
      lines.push(...wrapLine(fg(TUI_COLOR.text, `> ${this.draft}`), width))
      return lines
    }
    options.forEach((option, index) => {
      const chosen = this.selected.has(option.label)
      const mark = chosen ? fg(TUI_COLOR.accent, '*') : ' '
      const label = chosen ? fg(TUI_COLOR.accent, option.label) : option.label
      const description = option.description === undefined ? '' : fg(TUI_COLOR.muted, ` — ${option.description}`)
      lines.push(...wrapLine(`${mark} ${String(index + 1)}. ${label}${description}`, width))
    })
    return lines
  }

  /** No cached render state. */
  invalidate(): void {}

  /**
   * Handle one input sequence: digits toggle or choose options, enter confirms,
   * escape cancels, and printable characters append to a free-text draft.
   * @param data - raw terminal input.
   */
  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      this.fail?.(new UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED'))
      return
    }
    const options = this.question.options ?? []
    if (options.length === 0) {
      if (matchesKey(data, 'enter') || data === '\r' || data === '\n') {
        this.done?.({ id: this.question.id, selected: [], custom: this.draft })
        return
      }
      if (matchesKey(data, 'backspace') || data === '\x7f' || data === '\b') {
        this.draft = this.draft.slice(0, -1)
        return
      }
      if (data !== '' && !/[\u0000-\u001f]/.test(data)) this.draft += data
      return
    }
    if (matchesKey(data, 'enter') || data === '\r' || data === '\n') {
      this.confirmOptions(options)
      return
    }
    const index = Number(data) - 1
    if (!Number.isInteger(index) || index < 0) return
    const option = options[index]
    if (option === undefined) return
    const label = option.label
    if (this.question.multiSelect === true) {
      if (this.selected.has(label)) this.selected.delete(label)
      else this.selected.add(label)
      return
    }
    this.done?.({ id: this.question.id, selected: [label] })
  }

  /**
   * Confirm the current multi-select set, including an empty skip.
   * @param options - the question's option list, already known to be present.
   */
  private confirmOptions(options: NonNullable<AskUserQuestionItem['options']>): void {
    const selected = options
      .map(option => option.label)
      .filter(label => this.selected.has(label))
    this.done?.({ id: this.question.id, selected })
  }
}

/**
 * Register a user-questions provider that prompts through TUI overlays.
 * @param tui - the live renderer that owns overlay focus.
 * @returns the provider `ask()` implementation.
 */
export function createQuestionProvider(tui: TUI): UserQuestionProvider {
  return {
    async ask(request: AskUserQuestionRequest) {
      const answers: AskUserQuestionAnswerItem[] = []
      for (const question of request.questions) {
        const form = new QuestionForm(question)
        const handle = tui.showOverlay(form)
        try {
          answers.push(await form.wait(request.signal))
        } finally {
          handle.hide()
        }
      }
      return { answers }
    },
  }
}
