/**
 * `dsh login`, `dsh logout`, and `dsh auth` — launcher-level subscription-login
 * commands. They boot a minimal composition (the durable OAuth store plus this
 * command surface) instead of a full profile, so no profile startup parser can
 * race `@deepseek-ai/dsh-command-login` on the same arguments. Because both the
 * store here and the pi-ai adapter in a profile default to
 * `$DSH_HOME/.auth.yaml`, a token written here is read by model requests in any
 * profile.
 *
 * @module @deepseek-ai/dsh/login
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'

/** Anchor of this app: both the source tree and the bundled bin live one directory under apps/cli. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** The minimal composition the login tree mounts, written as the root config. */
const LOGIN_ROOT_CONFIG = `# dsh login — a minimal composition: the durable OAuth store plus the login
# command surface. No profile startup is mounted, so this command line is parsed
# only by @deepseek-ai/dsh-command-login.
- id: llm-oauth
  name: '@deepseek-ai/dsh-llm-oauth'
- id: command-login
  name: '@deepseek-ai/dsh-command-login'
`

/**
 * Boot the minimal login tree over the app's own anchor, hand the inner
 * command line to `@deepseek-ai/dsh-command-login`, and settle shutdown. The
 * command surface requests exit through `ctx.appExit`.
 * @param args - everything after `dsh login|logout|auth`, with the command
 *   name prepended (`['login', 'openai']`, `['auth']`, ...).
 * @returns the process exit code the command surface requested.
 */
export async function runLoginCommand(args: readonly string[]): Promise<number> {
  const rootDir = await mkdtemp(join(tmpdir(), 'dsh-login-'))
  const rootConfig = join(rootDir, 'cordis.yml')
  await writeFile(rootConfig, LOGIN_ROOT_CONFIG, 'utf8')
  let exitCode = 0
  const ctx = await boot(
    'dsh',
    rootConfig,
    undefined,
    (hostCtx) => {
      // Bare plugin names like `@deepseek-ai/dsh-llm-oauth` resolve from the
      // app's own node_modules, not the temp root config dir.
      provideCmdline(hostCtx, {
        args,
        exit: (code) => {
          exitCode = code
        },
      })
    },
    pathToFileURL(dirname(INSTALL_ANCHOR)).href,
  )
  await ctx.fiber.await()
  void ctx.fiber.dispose()
  return exitCode
}
