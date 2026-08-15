/**
 * Worker stdout/stderr capture. Node fills the pipes when `stdout: true`;
 * bun leaves them null, so stray native writes are not captured there.
 * JS-level console and stream writes still reach the message port.
 * @module @deepseek-ai/dsh-code-runtime-worker-thread/pipes
 */

import type { Readable } from 'node:stream'

/**
 * Attach stray-byte listeners when the runtime actually created pipes.
 * @param stdout - `worker.stdout`, or null on bun.
 * @param stderr - `worker.stderr`, or null on bun.
 * @param onChunk - admitted into the outer log ledger.
 */
export function listenWorkerPipes(
  stdout: Readable | null,
  stderr: Readable | null,
  onChunk: (chunk: Buffer) => void,
): void {
  stdout?.on('data', onChunk)
  stderr?.on('data', onChunk)
}

/**
 * Wait until both pipes have emitted queued data, or resolve immediately
 * when a runtime never created them.
 * @param stdout - `worker.stdout`, or null on bun.
 * @param stderr - `worker.stderr`, or null on bun.
 * @returns after both sides are ended, closed, errored, or missing.
 */
export async function drainWorkerPipes(
  stdout: Readable | null,
  stderr: Readable | null,
): Promise<void> {
  await Promise.all([waitForPipeDrain(stdout), waitForPipeDrain(stderr)])
}

/**
 * Resolve after one worker pipe emits all queued data, or closes/errors
 * during termination. A missing pipe is already drained.
 * @param stream - one worker stdio pipe, or null.
 * @returns after the pipe is ended, closed, errored, or missing.
 */
export function waitForPipeDrain(stream: Readable | null): Promise<void> {
  if (stream === null || stream.readableEnded || stream.destroyed) return Promise.resolve()
  return new Promise((resolve) => {
    const done = (): void => {
      stream.off('end', done)
      stream.off('close', done)
      stream.off('error', done)
      resolve()
    }
    stream.once('end', done)
    stream.once('close', done)
    stream.once('error', done)
    // Close the event-registration race if termination finished between the
    // initial state check and the listeners above.
    /* v8 ignore next -- this race cannot be scheduled deterministically between the adjacent state check and listener registration. */
    if (stream.readableEnded || stream.destroyed) done()
  })
}
