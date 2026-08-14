/**
 * TUI `AuthInteraction` for `ctx.llmOAuth.login`: OverlayPicker for select,
 * a text form for text / secret / manual_code, and a status overlay for the
 * auth URL or device code the human acts on.
 * @module @deepseek-ai/dsh-tui/login
 */

import type { Component, OverlayHandle, TUI } from '@oh-my-pi/pi-tui'
import { matchesKey } from '@oh-my-pi/pi-tui'
import type { LlmOAuthService, LoginableProvider } from '@deepseek-ai/dsh-llm-oauth'
import { OverlayPicker, showPicker } from './picker.ts'
import { bold, fg, TUI_COLOR } from './theme.ts'
import { wrapLine } from './wrap.ts'

/** The pi-ai interaction `LlmOAuthService.login` accepts. */
type AuthInteraction = Parameters<LlmOAuthService['login']>[1]
/** One prompt the interaction must answer. */
type AuthPrompt = Parameters<AuthInteraction['prompt']>[0]
/** One notification the flow emits while waiting on the human. */
type AuthEvent = Parameters<AuthInteraction['notify']>[0]

/** Rejection when Escape, abort, or an external hide cancels the flow. */
export const LOGIN_CANCELLED = 'Login cancelled'

/** Rejection when a text / secret / manual_code prompt is submitted empty. */
export const LOGIN_VALUE_REQUIRED = 'A value is required'

/** Visible overlay handle the session owns for the login flow's lifetime. */
export interface LoginOverlayHandle {
  /** Hide every login overlay and abort the interaction. */
  hide(): void
}

/** Optional overlay lifetime hooks for the owning TUI session. */
export interface LoginPromptHooks {
  /** The first login overlay is visible; the owner may record the handle. */
  onOpen?: (handle: LoginOverlayHandle) => void
  /** Every login overlay has been hidden after settle, cancel, or dismiss. */
  onClose?: () => void
  /** An info or progress notification to fold into the transcript. */
  onNotice?: (text: string) => void
}

const OVERLAY = { anchor: 'bottom-center', width: '90%', maxHeight: '40%' } as const

/**
 * Free-text overlay for `text`, `secret`, and `manual_code` prompts.
 */
export class LoginTextForm implements Component {
  private draft = ''
  private done: ((value: string) => void) | undefined
  private fail: ((error: Error) => void) | undefined

  /**
   * @param message - the prompt heading.
   * @param placeholder - dim hint shown while the draft is empty.
   * @param secret - when true, the draft paints as asterisks.
   */
  constructor(
    private readonly message: string,
    private readonly placeholder?: string,
    private readonly secret = false,
  ) {}

  /**
   * Wait until the user submits a non-empty value or the signal aborts.
   * @param signal - the owning login abort signal.
   * @returns the submitted text.
   */
  wait(signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error(LOGIN_CANCELLED))
        return
      }
      this.done = resolve
      this.fail = reject
      const onAbort = (): void => {
        signal?.removeEventListener('abort', onAbort)
        this.fail?.(new Error(LOGIN_CANCELLED))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * @param width - columns available to this overlay.
   * @returns heading, draft, and hint rows.
   */
  render(width: number): string[] {
    const shown = this.secret ? '*'.repeat(this.draft.length) : this.draft
    const body = this.draft.length === 0 && this.placeholder !== undefined
      ? fg(TUI_COLOR.dim, this.placeholder)
      : shown
    return [
      ...wrapLine(bold(fg(TUI_COLOR.accent, this.message)), width),
      ...wrapLine(fg(TUI_COLOR.text, `> ${body}`), width),
      ...wrapLine(fg(TUI_COLOR.dim, 'Enter submit · Esc cancel'), width),
    ]
  }

  /** No cached render state. */
  invalidate(): void {}

  /**
   * Handle one input sequence: enter submits, escape cancels, backspace
   * deletes, and printable characters append to the draft.
   * @param data - raw terminal input.
   */
  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      this.fail?.(new Error(LOGIN_CANCELLED))
      return
    }
    if (matchesKey(data, 'enter') || data === '\r' || data === '\n') {
      if (this.draft.length === 0) {
        this.fail?.(new Error(LOGIN_VALUE_REQUIRED))
        return
      }
      this.done?.(this.draft)
      return
    }
    if (matchesKey(data, 'backspace') || data === '\x7f' || data === '\b') {
      this.draft = this.draft.slice(0, -1)
      return
    }
    if (data !== '' && !/[\u0000-\u001f]/.test(data)) this.draft += data
  }
}

/**
 * Persistent status overlay for `auth_url` and `device_code`. Escape aborts
 * the whole login; the flow otherwise keeps waiting after notify returns.
 */
export class LoginStatusView implements Component {
  /**
   * @param title - accent heading.
   * @param body - URL, code, and optional instructions.
   * @param onCancel - Escape / Ctrl+C handler.
   */
  constructor(
    private readonly title: string,
    private readonly body: readonly string[],
    private readonly onCancel: () => void,
  ) {}

  /**
   * @param width - columns available to this overlay.
   * @returns heading, body, and hint rows.
   */
  render(width: number): string[] {
    return [
      ...wrapLine(bold(fg(TUI_COLOR.accent, this.title)), width),
      ...this.body.flatMap(line => wrapLine(fg(TUI_COLOR.text, line), width)),
      ...wrapLine(fg(TUI_COLOR.dim, 'Esc cancel'), width),
    ]
  }

  /** No cached render state. */
  invalidate(): void {}

  /**
   * Escape or Ctrl+C abort the login; other keys are ignored.
   * @param data - raw terminal input.
   */
  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) this.onCancel()
  }
}

/**
 * An `AuthInteraction` that prompts and notifies through TUI overlays.
 * @param tui - the live renderer that owns overlay focus.
 * @param hooks - optional open/close/notice notifications for the session owner.
 * @param ownerSignal - optional owner lifetime signal that cancels the flow before an overlay opens.
 * @returns prompts over overlays and notifications on the transcript or a status overlay.
 */
export function createTuiAuthInteraction(
  tui: TUI,
  hooks: LoginPromptHooks = {},
  ownerSignal?: AbortSignal,
): AuthInteraction {
  const abort = new AbortController()
  let inner: OverlayHandle | undefined
  let opened = false
  let closed = false

  const dismissInner = (): void => {
    inner?.hide()
    inner = undefined
  }

  const close = (aborted: boolean): void => {
    if (closed) return
    closed = true
    dismissInner()
    ownerSignal?.removeEventListener('abort', onOwnerAbort)
    if (aborted) abort.abort()
    if (opened) hooks.onClose?.()
  }

  const publishHandle = (): void => {
    if (opened) return
    opened = true
    hooks.onOpen?.({ hide: () => { close(true) } })
  }

  const show = (component: Component, picker = false): void => {
    dismissInner()
    inner = picker
      ? showPicker(tui, component as OverlayPicker)
      : tui.showOverlay(component, OVERLAY)
    publishHandle()
  }

  const cancelled = (): Error => new Error(LOGIN_CANCELLED)

  const promptSignal = (prompt: AuthPrompt): AbortSignal => {
    if (prompt.signal === undefined) return abort.signal
    return AbortSignal.any([abort.signal, prompt.signal])
  }

  function onOwnerAbort(): void { close(true) }
  if (ownerSignal?.aborted) close(true)
  else ownerSignal?.addEventListener('abort', onOwnerAbort, { once: true })

  return {
    signal: abort.signal,
    prompt: async (prompt) => {
      if (prompt.signal?.aborted || abort.signal.aborted) throw cancelled()
      if (prompt.type === 'select') {
        return new Promise<string>((resolve, reject) => {
          const combined = promptSignal(prompt)
          const settle = (fn: () => void): void => {
            combined.removeEventListener('abort', onAbort)
            dismissInner()
            fn()
          }
          const onAbort = (): void => { settle(() => { reject(cancelled()) }) }
          const picker = new OverlayPicker(
            prompt.message,
            prompt.options.map(option => ({
              value: option.id,
              label: option.label,
              ...option.description === undefined ? {} : { description: option.description },
            })),
            '↑/↓ · Enter select · Esc cancel',
            {
              onSelect: (item) => { settle(() => { resolve(item.value) }) },
              onCancel: () => { settle(() => { reject(cancelled()) }) },
            },
          )
          show(picker, true)
          if (combined.aborted) {
            onAbort()
            return
          }
          combined.addEventListener('abort', onAbort, { once: true })
        })
      }
      const form = new LoginTextForm(
        prompt.message,
        prompt.placeholder,
        prompt.type === 'secret',
      )
      show(form)
      try {
        return await form.wait(promptSignal(prompt))
      } finally {
        dismissInner()
      }
    },
    notify: (event: AuthEvent) => {
      switch (event.type) {
        case 'auth_url': {
          const body = [
            event.url,
            ...event.instructions === undefined ? [] : [event.instructions],
          ]
          show(new LoginStatusView('Open this URL in your browser', body, () => { close(true) }))
          break
        }
        case 'device_code':
          show(new LoginStatusView('Device login', [
            event.verificationUri,
            `Enter the code: ${event.userCode}`,
          ], () => { close(true) }))
          break
        case 'info':
        case 'progress':
          hooks.onNotice?.(event.message)
          break
        default:
          // Unknown notification: ignore, matching the CLI interaction.
          break
      }
    },
  }
}

/**
 * One-line status for every loginable provider.
 * @param loginable - catalog providers that ship an OAuth flow.
 * @param stored - provider ids that currently have a stored credential.
 * @returns a notice body, or a missing-catalog line when `loginable` is empty.
 */
export function formatAuthStatus(
  loginable: readonly LoginableProvider[],
  stored: ReadonlySet<string>,
): string {
  if (loginable.length === 0) return 'no subscription login providers'
  const parts = loginable.map((candidate) => {
    const mark = stored.has(candidate.id) ? 'logged in' : 'logged out'
    return `${candidate.id} ${mark}`
  })
  return `Subscription logins: ${parts.join('; ')}`
}
