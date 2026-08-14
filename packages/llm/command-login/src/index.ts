/**
 * CLI commands for pi-ai subscription login: `login <provider>`,
 * `logout <provider>`, and `auth`, mounted as app command-line arguments
 * through `@deepseek-ai/dsh-cmdline`. Only an invocation whose first inner
 * argument is one of these commands participates; any other inner arguments
 * are the booted profile's own app, so `dsh login openai` runs the flow and
 * exits while `dsh --resume <session>` boots untouched.
 *
 * @module @deepseek-ai/dsh-command-login
 */

import { Command } from 'commander'
import { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { CmdlineArgs, AppExit } from '@deepseek-ai/dsh-cmdline'
import { internals } from '@deepseek-ai/dsh-cmdline'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmOAuthService } from '@deepseek-ai/dsh-llm-oauth'
import { terminalInteraction } from './interaction.ts'

export const name = 'command-login'
export const inject = ['llmOAuth', 'cmdlineArgs']

/** Subcommands this plugin owns, gating the rest of the invocation. */
const COMMANDS: ReadonlySet<string> = new Set(['login', 'logout', 'auth'])

/**
 * Whether an invocation's inner arguments start with a command this plugin
 * owns. Anything else — a task, a `--resume` flag, a profile flag — belongs
 * to another app, so this plugin must not consume it.
 * @param args - the invocation's inner arguments.
 * @returns true when the first token is one of this plugin's commands.
 */
export function ownsInvocation(args: readonly string[]): boolean {
  const first = args[0]
  return first !== undefined && COMMANDS.has(first)
}

/**
 * Register the login/logout/auth command surface. The launcher boots this
 * plugin in a minimal tree; a profile that happens to mount it no-ops unless
 * the inner arguments start with one of its commands. Commander actions stay
 * synchronous (they only capture the work) because {@link parseCmdline} uses
 * `parse`, not `parseAsync`.
 * @param ctx - Cordis context carrying `cmdlineArgs`, `appExit`, and `llmOAuth`.
 */
export async function apply(ctx: Context): Promise<void> {
  const cmdlineArgs = ctx.get('cmdlineArgs') as CmdlineArgs
  if (!ownsInvocation(cmdlineArgs.get())) return
  const exit = ctx.get('appExit') as AppExit

  let run: () => Promise<void> = async () => {}

  const program = new Command()
    .name('dsh')
    .description('Manage pi-ai subscription logins.')
    .helpOption('-h, --help', 'show this help')
    .exitOverride()

  program
    .command('login [provider]')
    .description('log in to a subscription provider, persisting the token')
    .action((provider?: string) => {
      run = async () => {
        const chosen = await resolveProvider(ctx.llmOAuth, provider)
        await ctx.llmOAuth.login(chosen, terminalInteraction())
        internals.stdout.write(`\nLogged in to "${chosen}"; the credential is persisted.\n`)
        exit(0)
      }
    })

  program
    .command('logout <provider>')
    .description('remove the stored credential for a provider')
    .action((provider: string) => {
      run = async () => {
        await ctx.llmOAuth.logout(provider)
        internals.stdout.write(`\nLogged out of "${provider}".\n`)
        exit(0)
      }
    })

  program
    .command('auth')
    .description('show which providers are logged in')
    .action(() => {
      run = async () => {
        await showStatus(ctx.llmOAuth)
        exit(0)
      }
    })

  parseCmdline(ctx, program)
  try {
    await run()
  } catch (error) {
    writeError(error)
    exit(1)
  }
}

/** Resolve the provider argument, prompting a select when omitted. */
async function resolveProvider(oauth: LlmOAuthService, provider?: string): Promise<string> {
  if (provider !== undefined && provider.length > 0) return provider
  const candidates = oauth.loginableProviders()
  if (candidates.length === 0) {
    throw new LlmError('no pi-ai providers ship a subscription login flow', 'NO_OAUTH')
  }
  const interaction = terminalInteraction()
  return interaction.prompt({
    type: 'select',
    message: 'Select a provider to log in to:',
    options: candidates.map(candidate => ({ id: candidate.id, label: candidate.name })),
  })
}

/**
 * Render subscription-login status for every loginable provider.
 * @param oauth - the mounted store.
 */
export async function showStatus(oauth: LlmOAuthService): Promise<void> {
  const stored = new Set((await oauth.list()).map(entry => entry.providerId))
  const lines = oauth.loginableProviders().map((candidate) => {
    const mark = stored.has(candidate.id) ? 'logged in' : 'logged out'
    return `  ${candidate.id.padEnd(24)} ${mark}`
  })
  internals.stdout.write(`\nSubscription logins:\n${lines.join('\n')}\n`)
}

/** Write an error line through the cmdline adapter. */
function writeError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  internals.stderr.write(`error: ${message}\n`)
}
