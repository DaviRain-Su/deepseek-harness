import { afterEach, describe, expect, it, vi } from 'vitest'
import { internals } from '@deepseek-ai/dsh-cmdline'
import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai'
import { terminalInteraction } from '../src/interaction.ts'

const question = vi.fn((_query: string, reply: (answer: string) => void) => {
  reply('1')
})
const close = vi.fn()

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({ question, close })),
}))

afterEach(() => {
  question.mockReset()
  question.mockImplementation((_query: string, reply: (answer: string) => void) => {
    reply('1')
  })
  close.mockClear()
  internals.stdout = process.stdout
})

describe('terminalInteraction', () => {
  it('rejects an already-aborted prompt', async () => {
    const signal = AbortSignal.abort()
    await expect(terminalInteraction().prompt({ type: 'text', message: 'Token', signal }))
      .rejects.toThrow('Login cancelled')
  })

  it('resolves a select by 1-based index and rejects an invalid choice', async () => {
    const prompt: AuthPrompt = {
      type: 'select',
      message: 'Provider',
      options: [
        { id: 'openai-codex', label: 'OpenAI Codex' },
        { id: 'xai', label: 'xAI' },
      ],
    }
    await expect(terminalInteraction().prompt(prompt)).resolves.toBe('openai-codex')
    question.mockImplementationOnce((_query, reply) => { reply('99') })
    await expect(terminalInteraction().prompt(prompt)).rejects.toThrow('Invalid selection')
  })

  it('resolves a text prompt and rejects an empty answer', async () => {
    question.mockImplementationOnce((_query, reply) => { reply('sk-test') })
    await expect(terminalInteraction().prompt({
      type: 'text',
      message: 'API key',
      placeholder: 'sk-…',
      signal: new AbortController().signal,
    })).resolves.toBe('sk-test')
    question.mockImplementationOnce((_query, reply) => { reply('') })
    await expect(terminalInteraction().prompt({ type: 'secret', message: 'Secret' }))
      .rejects.toThrow('A value is required')
  })

  it('prints auth_url, device_code, info, progress, and ignores an unknown event', () => {
    let out = ''
    internals.stdout = { write: (chunk: string) => { out += chunk; return true } }
    const interaction = terminalInteraction()
    interaction.notify({ type: 'auth_url', url: 'https://example.test/start' })
    interaction.notify({ type: 'auth_url', url: 'https://example.test/auth', instructions: 'Continue' })
    interaction.notify({ type: 'device_code', userCode: 'ABCD', verificationUri: 'https://example.test/device' })
    interaction.notify({ type: 'info', message: 'Waiting' })
    interaction.notify({ type: 'progress', message: 'Still waiting' })
    interaction.notify({ type: 'future' } as unknown as AuthEvent)
    expect(out).toMatch(/https:\/\/example.test\/auth/)
    expect(out).toMatch(/Continue/)
    expect(out).toMatch(/https:\/\/example.test\/device/)
    expect(out).toMatch(/ABCD/)
    expect(out).toMatch(/Waiting/)
    expect(out).toMatch(/Still waiting/)
  })
})
