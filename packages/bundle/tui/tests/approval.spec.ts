/** Approval overlay: Allow once, Reject, cancel, abort, and foreign-agent delegate. */

import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { TUI } from '@oh-my-pi/pi-tui'
import type { ApprovalOverlayHandle } from '../src/approval.ts'
import { OverlayPicker } from '../src/picker.ts'
import { createApprovalAnswerer, promptApproval } from '../src/approval.ts'

function fakeTui(): { tui: TUI; pickers: OverlayPicker[]; hidden: number } {
  const pickers: OverlayPicker[] = []
  let hidden = 0
  const tui = {
    showOverlay: (component: OverlayPicker) => {
      pickers.push(component)
      return { hide: () => { hidden += 1 } }
    },
  } as unknown as TUI
  return {
    tui,
    pickers,
    get hidden() { return hidden },
  }
}

function request(agent: Agent, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return { agent, toolName: 'bash', reason: 'escalate sandbox to workspace-write', ...overrides }
}

describe('promptApproval', () => {
  it('grants Allow once and hides the overlay', async () => {
    const shown = fakeTui()
    const pending = promptApproval(shown.tui, { toolName: 'bash', reason: 'write the file' })
    expect(shown.pickers[0]?.render(40).some(line => line.includes('Allow bash?'))).toBe(true)
    expect(shown.pickers[0]?.render(40).some(line => line.includes('write the file'))).toBe(true)
    shown.pickers[0]?.invalidate()
    shown.pickers[0]?.handleInput('\r')
    await expect(pending).resolves.toBe('allowed-once')
    expect(shown.hidden).toBe(1)
  })

  it('rejects the second row', async () => {
    const { tui, pickers } = fakeTui()
    const pending = promptApproval(tui, { toolName: 'edit' })
    expect(pickers[0]?.render(40).some(line => line.includes('This action needs approval'))).toBe(true)
    pickers[0]?.handleInput('\x1b[B')
    pickers[0]?.handleInput('\r')
    await expect(pending).resolves.toBe('rejected')
  })

  it('cancels on escape, an abort, or an external hide', async () => {
    const escaped = fakeTui()
    const escaping = promptApproval(escaped.tui, { toolName: 'bash' })
    escaped.pickers[0]?.handleInput('\x1b')
    await expect(escaping).resolves.toBe('cancelled')

    const aborted = new AbortController()
    aborted.abort()
    await expect(promptApproval(fakeTui().tui, { toolName: 'bash', signal: aborted.signal })).resolves.toBe('cancelled')

    const live = new AbortController()
    const waiting = fakeTui()
    const pending = promptApproval(waiting.tui, { toolName: 'bash', signal: live.signal })
    live.abort()
    await expect(pending).resolves.toBe('cancelled')

    const opened: ApprovalOverlayHandle[] = []
    const hiding = fakeTui()
    const hidden = promptApproval(hiding.tui, { toolName: 'bash' }, {
      onOpen: (handle) => { opened.push(handle) },
    })
    opened[0]?.hide()
    await expect(hidden).resolves.toBe('cancelled')
  })
})

describe('createApprovalAnswerer', () => {
  it('answers only the owned agent and delegates otherwise', async () => {
    const owned = { id: 'mine' } as Agent
    const other = { id: 'theirs' } as Agent
    const { tui, pickers } = fakeTui()
    const answer = createApprovalAnswerer(tui, () => owned)
    const delegated = answer(request(other), () => Promise.resolve<ApprovalOutcome>('unavailable'))
    await expect(delegated).resolves.toBe('unavailable')
    expect(pickers).toHaveLength(0)

    const pending = answer(request(owned), () => Promise.resolve<ApprovalOutcome>('unavailable'))
    pickers[0]?.handleInput('\r')
    await expect(pending).resolves.toBe('allowed-once')
  })
})
