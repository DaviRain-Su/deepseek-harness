/** TUI AuthInteraction: select, text, cancel, abort, and notify kinds. */

import { describe, expect, it } from 'vitest'
import type { Component, TUI } from '@oh-my-pi/pi-tui'
import { OverlayPicker } from '../src/picker.ts'
import {
  createTuiAuthInteraction,
  formatAuthStatus,
  LOGIN_CANCELLED,
  LOGIN_VALUE_REQUIRED,
  LoginOverlayHandle,
  LoginStatusView,
  LoginTextForm,
} from '../src/login.ts'

function fakeTui(): { tui: TUI; shown: Component[]; hidden: number } {
  const shown: Component[] = []
  let hidden = 0
  const tui = {
    showOverlay: (component: Component) => {
      shown.push(component)
      return { hide: () => { hidden += 1 } }
    },
  } as unknown as TUI
  return {
    tui,
    shown,
    get hidden() { return hidden },
  }
}

describe('formatAuthStatus', () => {
  it('joins loginable providers and reports an empty catalog', () => {
    expect(formatAuthStatus([], new Set())).toBe('no subscription login providers')
    expect(formatAuthStatus(
      [{ id: 'openai-codex', name: 'OpenAI Codex' }, { id: 'anthropic', name: 'Anthropic' }],
      new Set(['openai-codex']),
    )).toBe('Subscription logins: openai-codex logged in; anthropic logged out')
  })
})

describe('createTuiAuthInteraction', () => {
  it('resolves a select by the option id', async () => {
    const shown = fakeTui()
    const pending = createTuiAuthInteraction(shown.tui).prompt({
      type: 'select',
      message: 'Provider',
      options: [
        { id: 'openai-codex', label: 'OpenAI Codex' },
        { id: 'xai', label: 'xAI', description: 'Grok' },
      ],
    })
    const picker = shown.shown[0] as OverlayPicker
    expect(picker.render(40).some(line => line.includes('Provider'))).toBe(true)
    picker.invalidate()
    picker.handleInput('\r')
    await expect(pending).resolves.toBe('openai-codex')
    expect(shown.hidden).toBe(1)
  })

  it('resolves a text prompt and masks a secret draft', async () => {
    const text = fakeTui()
    const pending = createTuiAuthInteraction(text.tui).prompt({
      type: 'text',
      message: 'API key',
      placeholder: 'sk-…',
    })
    const form = text.shown[0] as LoginTextForm
    expect(form.render(40).some(line => line.includes('sk-…'))).toBe(true)
    form.handleInput('s')
    form.handleInput('k')
    form.invalidate()
    form.handleInput('\r')
    await expect(pending).resolves.toBe('sk')

    const secret = fakeTui()
    const hiding = createTuiAuthInteraction(secret.tui).prompt({ type: 'secret', message: 'Secret' })
    const hidden = secret.shown[0] as LoginTextForm
    hidden.handleInput('ab')
    expect(hidden.render(40).some(line => line.includes('**'))).toBe(true)
    expect(hidden.render(40).some(line => line.includes('ab'))).toBe(false)
    hidden.handleInput('\x7f')
    hidden.handleInput('\r')
    await expect(hiding).resolves.toBe('a')
  })

  it('rejects an empty text submit, escape, abort, and an already-aborted prompt', async () => {
    const empty = fakeTui()
    const missing = createTuiAuthInteraction(empty.tui).prompt({ type: 'text', message: 'Token' })
    ;(empty.shown[0] as LoginTextForm).handleInput('\r')
    await expect(missing).rejects.toThrow(LOGIN_VALUE_REQUIRED)

    const escaped = fakeTui()
    const cancelling = createTuiAuthInteraction(escaped.tui).prompt({ type: 'manual_code', message: 'Code' })
    ;(escaped.shown[0] as LoginTextForm).handleInput('\x1b')
    await expect(cancelling).rejects.toThrow(LOGIN_CANCELLED)

    const aborted = fakeTui()
    const live = new AbortController()
    const waiting = createTuiAuthInteraction(aborted.tui).prompt({
      type: 'text',
      message: 'Token',
      signal: live.signal,
    })
    live.abort()
    await expect(waiting).rejects.toThrow(LOGIN_CANCELLED)

    await expect(createTuiAuthInteraction(fakeTui().tui).prompt({
      type: 'text',
      message: 'Token',
      signal: AbortSignal.abort(),
    })).rejects.toThrow(LOGIN_CANCELLED)
  })

  it('cancels a flow when the owning runtime aborts before a prompt opens', async () => {
    const shown = fakeTui()
    const owner = new AbortController()
    const interaction = createTuiAuthInteraction(shown.tui, {}, owner.signal)
    owner.abort()
    const pending = interaction.prompt({
      type: 'text',
      message: 'Token',
    })
    await expect(pending).rejects.toThrow(LOGIN_CANCELLED)
    expect(interaction.signal?.aborted).toBe(true)
    expect(shown.shown).toHaveLength(0)
  })

  it('cancels a select on escape or an external hide', async () => {
    const escaped = fakeTui()
    const cancelling = createTuiAuthInteraction(escaped.tui).prompt({
      type: 'select',
      message: 'Provider',
      options: [{ id: 'xai', label: 'xAI' }],
    })
    ;(escaped.shown[0] as OverlayPicker).handleInput('\x1b')
    await expect(cancelling).rejects.toThrow(LOGIN_CANCELLED)

    const opened: LoginOverlayHandle[] = []
    const hiding = fakeTui()
    const pending = createTuiAuthInteraction(hiding.tui, {
      onOpen: (handle) => { opened.push(handle) },
    }).prompt({
      type: 'select',
      message: 'Provider',
      options: [{ id: 'xai', label: 'xAI' }],
    })
    opened[0]?.hide()
    await expect(pending).rejects.toThrow(LOGIN_CANCELLED)
  })

  it('shows auth_url and device_code overlays, notices info/progress, and ignores unknown events', () => {
    const notices: string[] = []
    const shown = fakeTui()
    const interaction = createTuiAuthInteraction(shown.tui, {
      onNotice: (text) => { notices.push(text) },
    })
    interaction.notify({ type: 'auth_url', url: 'https://example.test/start' })
    interaction.notify({
      type: 'auth_url',
      url: 'https://example.test/auth',
      instructions: 'Continue',
    })
    const url = shown.shown.at(-1) as LoginStatusView
    expect(url.render(60).some(line => line.includes('https://example.test/auth'))).toBe(true)
    expect(url.render(60).some(line => line.includes('Continue'))).toBe(true)
    interaction.notify({
      type: 'device_code',
      userCode: 'ABCD',
      verificationUri: 'https://example.test/device',
    })
    const device = shown.shown.at(-1) as LoginStatusView
    expect(device.render(60).some(line => line.includes('ABCD'))).toBe(true)
    expect(device.render(60).some(line => line.includes('https://example.test/device'))).toBe(true)
    device.invalidate()
    interaction.notify({ type: 'info', message: 'Waiting' })
    interaction.notify({ type: 'progress', message: 'Still waiting' })
    interaction.notify({ type: 'future' } as never)
    expect(notices).toEqual(['Waiting', 'Still waiting'])
  })

  it('aborts the interaction when Escape is pressed on a status overlay', async () => {
    const shown = fakeTui()
    const interaction = createTuiAuthInteraction(shown.tui)
    interaction.notify({ type: 'auth_url', url: 'https://example.test/auth' })
    ;(shown.shown[0] as LoginStatusView).handleInput('\x1b')
    expect(interaction.signal?.aborted).toBe(true)
    await expect(interaction.prompt({ type: 'text', message: 'Token' })).rejects.toThrow(LOGIN_CANCELLED)
  })
})
