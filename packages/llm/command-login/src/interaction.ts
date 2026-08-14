/**
 * Bridge pi-ai's `AuthInteraction` to the process terminal: prompts read one
 * line at a time via `readline`, notifications print the auth URL / device
 * code the human acts on.
 *
 * @module @deepseek-ai/dsh-command-login/interaction
 */

import { createInterface } from 'node:readline'
import type { AuthInteraction, AuthPrompt, AuthEvent } from '@earendil-works/pi-ai'
import { internals } from '@deepseek-ai/dsh-cmdline'

/** Render one `AuthPrompt` into a readline question and resolve the reply. */
function askPrompt(prompt: AuthPrompt): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })
    if (prompt.type === 'select') {
      write(`\n${prompt.message}`)
      let index = 1
      for (const option of prompt.options) {
        write(`\n  ${index}. ${option.label}`)
        index += 1
      }
      rl.question(`\nEnter number (1-${prompt.options.length}): `, (answer) => {
        const choice = Number.parseInt(answer.trim(), 10) - 1
        const selected = prompt.options[choice]
        rl.close()
        if (selected === undefined) reject(new Error('Invalid selection'))
        else resolve(selected.id)
      })
      return
    }
    const suffix = prompt.placeholder === undefined ? '' : ` (${prompt.placeholder})`
    rl.question(`${prompt.message}${suffix}: `, (answer) => {
      rl.close()
      if (answer.length === 0) {
        reject(new Error('A value is required'))
        return
      }
      resolve(answer)
    })
  })
}

/** Write one line to the process stdout through the cmdline adapter. */
function write(text: string): void {
  void internals.stdout.write(text)
}

/**
 * An `AuthInteraction` for the process terminal.
 * @returns prompts over readline and notifications on stdout.
 */
export function terminalInteraction(): AuthInteraction {
  return {
    prompt: (prompt) => {
      if (prompt.signal !== undefined && prompt.signal.aborted) {
        return Promise.reject(new Error('Login cancelled'))
      }
      return askPrompt(prompt)
    },
    notify: (event: AuthEvent) => {
      switch (event.type) {
        case 'auth_url':
          write(`\nOpen this URL in your browser:\n${event.url}`)
          if (event.instructions !== undefined) write(`\n${event.instructions}`)
          break
        case 'device_code':
          write(`\nOpen this URL in your browser:\n${event.verificationUri}`)
          write(`\nEnter the code: ${event.userCode}`)
          break
        case 'info':
        case 'progress':
          write(`\n${event.message}`)
          break
        default:
          // Unknown notification event: print nothing; a future pi-ai type is
          // silently tolerated rather than failing the whole flow.
          break
      }
    },
  }
}
