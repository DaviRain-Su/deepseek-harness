/** Question overlay form and provider. */

import { describe, expect, it } from 'vitest'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { TUI } from '@earendil-works/pi-tui'
import { QuestionForm, createQuestionProvider } from '../src/questions.ts'

describe('QuestionForm', () => {
  it('selects a numbered option', async () => {
    const form = new QuestionForm({
      id: 'q1',
      question: 'Pick',
      detail: 'choose one',
      options: [{ label: 'A', description: 'first' }, { label: 'B' }],
    })
    const waiting = form.wait()
    expect(form.render(40).some(line => line.includes('Pick'))).toBe(true)
    form.invalidate()
    form.handleInput('1')
    await expect(waiting).resolves.toEqual({ id: 'q1', selected: ['A'] })
  })

  it('toggles multi-select and confirms on enter', async () => {
    const form = new QuestionForm({
      id: 'q2',
      question: 'Many',
      multiSelect: true,
      options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    })
    const waiting = form.wait()
    form.handleInput('1')
    form.handleInput('3')
    form.handleInput('1')
    form.handleInput('2')
    form.handleInput('9')
    form.handleInput('x')
    expect(form.render(40).some(line => line.includes('*'))).toBe(true)
    form.handleInput('\r')
    await expect(waiting).resolves.toEqual({ id: 'q2', selected: ['B', 'C'] })
  })

  it('confirms an empty multi-select on enter', async () => {
    const form = new QuestionForm({
      id: 'q2b',
      question: 'None',
      multiSelect: true,
      options: [{ label: 'A' }],
    })
    const waiting = form.wait()
    form.handleInput('\n')
    await expect(waiting).resolves.toEqual({ id: 'q2b', selected: [] })
  })

  it('collects free text, backspace, and enter', async () => {
    const form = new QuestionForm({ id: 'q3', question: 'Name?' })
    const waiting = form.wait()
    form.handleInput('a')
    form.handleInput('b')
    form.handleInput('c')
    form.handleInput('')
    form.handleInput('\x01')
    form.handleInput('\b')
    form.handleInput('\x7f')
    form.handleInput('\r')
    await expect(waiting).resolves.toEqual({ id: 'q3', selected: [], custom: 'a' })
    expect(form.render(20).some(line => line.includes('>'))).toBe(true)
  })

  it('rejects when the signal is already aborted or escape is pressed', async () => {
    const aborted = new AbortController()
    aborted.abort()
    const form = new QuestionForm({ id: 'q4', question: 'x', options: [{ label: 'A' }] })
    await expect(form.wait(aborted.signal)).rejects.toBeInstanceOf(UserQuestionError)

    const live = new QuestionForm({ id: 'q5', question: 'x', options: [{ label: 'A' }] })
    const waiting = live.wait()
    live.handleInput('\x1b')
    await expect(waiting).rejects.toBeInstanceOf(UserQuestionError)

    const cancelled = new QuestionForm({ id: 'q5c', question: 'x' })
    const cancelling = cancelled.wait()
    cancelled.handleInput('\x03')
    await expect(cancelling).rejects.toBeInstanceOf(UserQuestionError)
  })

  it('rejects when the signal aborts while waiting', async () => {
    const controller = new AbortController()
    const form = new QuestionForm({ id: 'q6', question: 'x' })
    const waiting = form.wait(controller.signal)
    controller.abort()
    await expect(waiting).rejects.toBeInstanceOf(UserQuestionError)
  })
})

describe('createQuestionProvider', () => {
  it('prompts each question through an overlay and hides it afterwards', async () => {
    const hidden: string[] = []
    const forms: QuestionForm[] = []
    const tui = {
      showOverlay: (component: QuestionForm) => {
        forms.push(component)
        return { hide: () => { hidden.push('hide') } }
      },
    } as unknown as TUI
    const provider = createQuestionProvider(tui)
    const pending = provider.ask({
      questions: [
        { id: 'q1', question: 'Go?', options: [{ label: 'Yes' }] },
        { id: 'q2', question: 'Name?' },
      ],
    })
    await Promise.resolve()
    forms[0]?.handleInput('1')
    await Promise.resolve()
    forms[1]?.handleInput('ok')
    forms[1]?.handleInput('\n')
    await expect(pending).resolves.toEqual({
      answers: [
        { id: 'q1', selected: ['Yes'] },
        { id: 'q2', selected: [], custom: 'ok' },
      ],
    })
    expect(hidden).toEqual(['hide', 'hide'])
  })
})
