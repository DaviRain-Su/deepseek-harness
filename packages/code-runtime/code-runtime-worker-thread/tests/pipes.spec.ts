/** Worker stdio helpers: Node pipes vs bun's null stdout/stderr. */

import { EventEmitter } from 'node:events'
import type { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { drainWorkerPipes, listenWorkerPipes, waitForPipeDrain } from '../src/pipes.ts'

function fakePipe(state: { readableEnded?: boolean; destroyed?: boolean } = {}): Readable {
  return Object.assign(new EventEmitter(), {
    readableEnded: state.readableEnded ?? false,
    destroyed: state.destroyed ?? false,
  }) as unknown as Readable
}

describe('listenWorkerPipes', () => {
  it('is a no-op when bun left both pipes null', () => {
    expect(() => { listenWorkerPipes(null, null, () => {}) }).not.toThrow()
  })

  it('forwards chunks from whichever pipe exists', () => {
    const chunks: Buffer[] = []
    const stdout = fakePipe()
    listenWorkerPipes(stdout, null, (chunk) => { chunks.push(chunk) })
    stdout.emit('data', Buffer.from('out'))
    expect(Buffer.concat(chunks).toString()).toBe('out')
  })

  it('forwards stderr when stdout is missing', () => {
    const onChunk = vi.fn()
    const stderr = fakePipe()
    listenWorkerPipes(null, stderr, onChunk)
    stderr.emit('data', Buffer.from('err'))
    expect(onChunk).toHaveBeenCalledOnce()
    expect(onChunk.mock.calls[0]?.[0].toString()).toBe('err')
  })
})

describe('waitForPipeDrain', () => {
  it('resolves immediately for a missing or already-ended pipe', async () => {
    await expect(waitForPipeDrain(null)).resolves.toBeUndefined()
    await expect(waitForPipeDrain(fakePipe({ readableEnded: true }))).resolves.toBeUndefined()
    await expect(waitForPipeDrain(fakePipe({ destroyed: true }))).resolves.toBeUndefined()
  })

  it('resolves when a live pipe ends, closes, or errors', async () => {
    const ending = fakePipe()
    const endingDone = waitForPipeDrain(ending)
    ending.emit('end')
    await endingDone

    const closing = fakePipe()
    const closingDone = waitForPipeDrain(closing)
    closing.emit('close')
    await closingDone

    const failing = fakePipe()
    const failingDone = waitForPipeDrain(failing)
    failing.emit('error', new Error('pipe closed'))
    await failingDone
  })
})

describe('drainWorkerPipes', () => {
  it('resolves when both sides are missing', async () => {
    await expect(drainWorkerPipes(null, null)).resolves.toBeUndefined()
  })

  it('waits for a live stderr while stdout is missing', async () => {
    const stderr = fakePipe()
    const drained = drainWorkerPipes(null, stderr)
    stderr.emit('end')
    await drained
  })
})
