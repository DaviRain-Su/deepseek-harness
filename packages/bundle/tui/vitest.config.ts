import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../../../vitest.shared.ts'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const packageRoot = fileURLToPath(new URL('.', import.meta.url))

/** Bun-only Vitest project: `@oh-my-pi/pi-tui` uses Bun APIs and cannot run under Node. */
export default defineConfig({
  root: repoRoot,
  plugins: [
    tsconfigPaths({ projects: [`${repoRoot}/tsconfig.base.json`] }),
    standardDecoratorPlugin(),
  ],
  test: {
    execArgv: vitestExecArgv,
    pool: 'forks',
    setupFiles: [`${repoRoot}/scripts/test-invariants.ts`],
    include: [`${packageRoot}/tests/**/*.spec.ts`],
  },
})
