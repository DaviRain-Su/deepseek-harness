/**
 * Terminal answerer for `approval/request`: Allow once / Reject overlay.
 * @module @deepseek-ai/dsh-tui/approval
 */

import type { TUI } from '@oh-my-pi/pi-tui'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { OverlayPicker, showPicker } from './picker.ts'

/** Visible overlay handle the session owns for the prompt's lifetime. */
export interface ApprovalOverlayHandle {
  /** Hide the overlay and settle the prompt as `cancelled`. */
  hide(): void
}

/** Optional overlay lifetime hooks for the owning TUI session. */
export interface ApprovalPromptHooks {
  /** The overlay is visible; the owner may record the handle. */
  onOpen?: (handle: ApprovalOverlayHandle) => void
  /** The overlay has been hidden after a decision or dismiss. */
  onClose?: () => void
}

/**
 * Prompt Allow once / Reject for one request. Escape, an abort, or hiding
 * the overlay settles `cancelled`. An already-aborted signal does not open.
 * @param tui - the live renderer that owns overlay focus.
 * @param req - tool name, optional reason, and optional abort signal.
 * @param hooks - optional open/close notifications for the session owner.
 * @returns the closed one-shot outcome.
 */
export function promptApproval(
  tui: TUI,
  req: Pick<ApprovalRequest, 'toolName' | 'reason' | 'signal'>,
  hooks?: ApprovalPromptHooks,
): Promise<ApprovalOutcome> {
  if (req.signal?.aborted) return Promise.resolve('cancelled')
  return new Promise((resolve) => {
    let settled = false
    // eslint-disable-next-line prefer-const -- assigned after showPicker below; settle closes over it before that point.
    let overlay: ApprovalOverlayHandle | undefined
    const settle = (outcome: ApprovalOutcome): void => {
      if (settled) return
      settled = true
      req.signal?.removeEventListener('abort', onAbort)
      overlay?.hide()
      hooks?.onClose?.()
      resolve(outcome)
    }
    const onAbort = (): void => { settle('cancelled') }
    const picker = new OverlayPicker(
      `Allow ${req.toolName}?`,
      [
        { value: 'allowed-once', label: 'Allow once' },
        { value: 'rejected', label: 'Reject' },
      ],
      req.reason ?? 'This action needs approval for this call only.',
      {
        onSelect: (item) => {
          settle(item.value === 'allowed-once' ? 'allowed-once' : 'rejected')
        },
        onCancel: () => { settle('cancelled') },
      },
    )
    const handle = showPicker(tui, picker)
    overlay = { hide: () => { handle.hide(); settle('cancelled') } }
    hooks?.onOpen?.(overlay)
    req.signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Waterfall listener that answers only for the TUI-owned agent.
 * @param tui - the live renderer.
 * @param owned - the session agent, or undefined after teardown.
 * @param hooks - optional overlay lifetime hooks.
 * @returns a decide-or-delegate `approval/request` listener.
 */
export function createApprovalAnswerer(
  tui: TUI,
  owned: () => Agent | undefined,
  hooks?: ApprovalPromptHooks,
): (req: ApprovalRequest, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome> {
  return (req, next) => {
    if (req.agent !== owned()) return next()
    return promptApproval(tui, req, hooks)
  }
}
