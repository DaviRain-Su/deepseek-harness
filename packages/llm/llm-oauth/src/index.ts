/**
 * Subscription-login (OAuth) seam (`ctx.llmOAuth`): an owner-only file-backed
 * credential store for pi-ai OAuth providers, plus the login/logout/status
 * operations that drive a provider's OAuth flow and persist the tokens.
 *
 * The store implements pi-ai's {@link CredentialStore}, so a pi-ai provider's
 * request path can reuse the same instance through `createModels({ credentials })`
 * — pi-ai then refreshes expired tokens under the store lock and resolves
 * request auth from the stored access token. Login is the app-owned half the
 * adapter deliberately does not run.
 *
 * @module @deepseek-ai/dsh-llm-oauth
 */

import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { watch as chokidarWatch } from 'chokidar'
import { Document, parseDocument, type YAMLError } from 'yaml'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { canonicalizeWatchPath } from '@deepseek-ai/dsh-home-paths'
import { Context, Service } from '@deepseek-ai/cordis'
import { builtinProviders } from '@earendil-works/pi-ai/providers/all'
import type { AuthInteraction, Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import { LlmError } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { resolveSpec } from './config.ts'
import type { LoginableProvider, ResolvedSpec } from './config.ts'

export { OAUTH_FILENAME, resolveSpec } from './config.ts'
export type { LoginableProvider, ResolvedSpec } from './config.ts'
export * from './types.ts'

/** Plugin config: file location and hot-reload behavior. */
export interface Config {
  /** Token document path; defaults to `.auth.yaml` under the harness home. */
  path?: string
  /** Harness home used when `path` is omitted; defaults to `$DSH_HOME` or `~/.dsh`. */
  dshHome?: string
  /** Watch the document and hot-publish external edits; defaults to true. */
  watch?: boolean
  /** Watcher write-settle window in milliseconds; defaults to 100. */
  debounceMs?: number
}

/** Runtime schema for {@link Config}; the cordis service config. */
export const Config: z<Config> = z.object({
  path: z.string(),
  dshHome: z.string(),
  watch: z.boolean().default(true),
  debounceMs: z.number().min(0).default(100),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable store and login/logout orchestration for pi-ai OAuth providers. */
    llmOAuth: LlmOAuthService
  }

  interface Events {
    /**
     * A provider's OAuth credential was durably committed or removed, whether
     * by a `modify`/`logout` write or an external edit observed in storage.
     * Listener failures are contained and logged; an INVARIANT failure rethrows
     * from synchronous listeners only.
     * @param provider - the provider route whose stored credential changed.
     * @mode emit
     */
    'llm/oauth-updated'(provider: string): void
  }
}

/** Permission bits outside the owner; a token document must have none of them. */
const GROUP_OTHER_BITS = 0o077

/**
 * Reject a token document other OS users can read, before its contents are
 * read at all. The store creates and replaces the file at `0600`, but a
 * hand-written or externally generated one carries whatever umask produced it.
 * @param filename - absolute path of the document.
 */
async function assertOwnerOnly(filename: string): Promise<void> {
  let mode: number
  try {
    mode = (await stat(filename)).mode
  } catch (error) {
    if (isENOENT(error)) {
      await canonicalizeWatchPath(filename)
      return
    }
    throw error
  }
  /* v8 ignore next -- Windows has no POSIX mode; POSIX behavior tests enforce this peer. */
  if (process.platform === 'win32') return
  /* v8 ignore start -- Windows has no mode to inspect; POSIX coverage takes the peer. */
  if ((mode & GROUP_OTHER_BITS) !== 0) {
    throw new Error(
      `llm-oauth: ${filename} is readable beyond its owner (mode ${(mode & 0o777).toString(8)});`
      + ` run "chmod 600 ${filename}" before starting again`,
    )
  }
  /* v8 ignore stop */
}

/** Whether a filesystem error means absence; every non-ENOENT failure must surface. */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/** Describe one YAML parse failure without quoting the source. */
function describeYamlError(error: YAMLError): string {
  const at = error.linePos?.[0]
  /* v8 ignore next -- yaml supplies linePos for every parse error we can construct */
  if (at === undefined) return error.code
  return `${error.code} at line ${String(at.line)}, column ${String(at.col)}`
}

/** Whether a stored entry is a valid `oauth`-tagged credential. */
function isOAuthCredential(value: unknown): value is Credential {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === 'oauth'
  )
}

/**
 * Parse one OAuth document into its provider entries. The document is a strict
 * mapping of provider id to an `oauth`-tagged credential. Anything else is
 * rejected rather than skipped, because this file holds nothing but OAuth
 * tokens and a silently ignored entry reads as missing.
 * @param text - the document's text.
 * @param filename - absolute path, quoted in errors.
 * @returns the parsed entries, keyed by provider id.
 */
export function parseOAuthDocument(text: string, filename: string): Map<string, Credential> {
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    throw new Error(`llm-oauth: invalid document at ${filename}: ${
      document.errors.map(describeYamlError).join('; ')}`)
  }
  const root: unknown = document.toJS() ?? {}
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    throw new TypeError(`llm-oauth: ${filename} must be a mapping of provider id to oauth credential`)
  }
  const entries = new Map<string, Credential>()
  for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
    if (key.length === 0) {
      throw new TypeError(`llm-oauth: ${filename} has an empty provider id`)
    }
    if (!isOAuthCredential(value)) {
      throw new TypeError(`llm-oauth: the value for provider "${key}" in ${filename} must be an oauth credential`)
    }
    entries.set(key, value)
  }
  return entries
}

/** Render one provider's stored credential (or delete it) preserving the rest. */
function renderDocument(text: string | undefined, provider: string, value: Credential | undefined): string {
  const document = text === undefined ? new Document({}) : parseDocument(text)
  if (value === undefined) document.deleteIn([provider])
  else document.setIn([provider], value)
  return document.toString()
}

/**
 * Durable subscription-login seam: pi-ai {@link CredentialStore} over an
 * owner-only file plus the login/logout orchestration and a notification of
 * each committed change.
 */
export class LlmOAuthService extends Service implements CredentialStore {
  static Config = Config

  /** Resolved and immutable store parameters. */
  readonly spec: ResolvedSpec

  /* jscpd:ignore-start */
  /** Raw text of the last read or persisted document; `undefined` while absent. */
  private text: string | undefined
  /** Parsed document snapshot; replaced wholesale on every reload. */
  private values = new Map<string, Credential>()
  /** Single exclusive operation chain; watcher reloads and writes run one at a time. */
  private operations: Promise<void> = Promise.resolve()
  /** Set at dispose: refuse new writes and let in-flight work no-op. */
  private closed = false
  /* jscpd:ignore-end */

  /**
   * @param ctx - Cordis context carrying `llm`.
   * @param config - raw plugin config.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'llmOAuth')
    this.spec = resolveSpec(config)
  }

  /** Opaque read of {@link closed}: control flow cannot narrow it across awaits. */
  private isClosed(): boolean {
    return this.closed
  }

  /** Queue one exclusive document operation behind every earlier one. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.operations.then(operation)
    this.operations = task.then(() => undefined, () => undefined)
    return task
  }

  async * [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    yield async () => {
      // Drain: refuse new operations, then settle the queued ones so disposal
      // completes only once storage is quiescent.
      this.closed = true
      await this.operations
    }
    await this.loadInitial()
    if (!this.spec.watch) return
    const watcher = chokidarWatch(await canonicalizeWatchPath(this.spec.filename), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.spec.debounceMs,
        pollInterval: Math.max(1, Math.min(this.spec.debounceMs, 10)),
      },
    })
    watcher.on('all', () => {
      if (this.closed) return
      this.queueRefresh()
    })
    watcher.on('ready', () => {
      if (this.closed) return
      this.queueRefresh()
    })
    watcher.on('error', (error) => {
      this.ctx.logger.warn('llm-oauth: watcher error on %s', this.spec.filename)
      this.ctx.logger.warn(error)
    })
    yield async () => {
      // Quiesce: stop accepting events, close the watcher, then wait out any
      // queued or in-flight operation so nothing publishes after disposal.
      this.closed = true
      await watcher.close()
      await this.operations
    }
  }

  // ---- CredentialStore ----

  /**
   * Read the stored credential for one provider, possibly expired.
   * @param providerId - provider route whose stored credential to read.
   * @returns the stored credential, or undefined when none is stored.
   */
  read(providerId: string): Promise<Credential | undefined> {
    return this.enqueue(() => Promise.resolve(this.values.get(providerId)))
  }

  /**
   * List stored credential metadata without resolving or exposing secrets.
   * @returns one entry per stored provider, type `oauth`, with no token material.
   */
  list(): Promise<readonly CredentialInfo[]> {
    return this.enqueue(() => Promise.resolve(
      [...this.values.keys()].map(providerId => ({ providerId, type: 'oauth' as const })),
    ))
  }

  /**
   * Serialized write — the only write path. Correct writes (refresh,
   * login-during-refresh) depend on seeing the current credential. The cycle
   * runs under both this instance's per-provider operation chain and the
   * document's cross-process writer lock, so a rotated token from one caller is
   * visible to the next and competing processes cannot resurrect a stale write.
   * @param providerId - provider route to update.
   * @param fn - returns the next credential, or undefined to leave the entry unchanged.
   * @returns the post-write credential, or undefined when unchanged or absent.
   */
  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    return this.enqueue(async () => {
      if (this.isClosed()) {
        throw new Error(`llm-oauth is disposed: cannot modify provider "${providerId}"`)
      }
      await mkdir(dirname(this.spec.filename), { recursive: true, mode: 0o700 })
      return withFileLock(this.spec.filename, async () => {
        await this.reconcileFromDisk()
        const current = this.values.get(providerId)
        const next = await fn(current)
        if (next === undefined) return undefined
        await this.persistSet(providerId, next)
        return next
      })
    })
  }

  /**
   * Remove a stored credential (logout): deleting an absent one is a no-op.
   * @param providerId - provider route whose stored credential to delete.
   */
  delete(providerId: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.isClosed()) {
        throw new Error(`llm-oauth is disposed: cannot delete provider "${providerId}"`)
      }
      await mkdir(dirname(this.spec.filename), { recursive: true, mode: 0o700 })
      await withFileLock(this.spec.filename, async () => {
        await this.reconcileFromDisk()
        if (this.values.get(providerId) === undefined) return
        await this.persistDelete(providerId)
      })
    })
  }

  // ---- Loginable-provider discovery ----

  /**
   * The installed catalog providers this seam can log into, in catalog order.
   * @returns each catalog provider that ships an OAuth flow.
   */
  loginableProviders(): LoginableProvider[] {
    return builtinProviders()
      .map(provider => ({ provider, oauth: provider.auth.oauth }))
      .filter((entry): entry is { provider: NonNullable<ReturnType<typeof builtinProviders>[number]>; oauth: NonNullable<ReturnType<typeof builtinProviders>[number]['auth']['oauth']> } =>
        entry.oauth !== undefined)
      .map(({ provider, oauth }) => ({
        id: provider.id,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pi-ai types non-optional but runtime omits name
        name: oauth.name ?? provider.id,
        ...oauth.loginLabel === undefined ? {} : { loginLabel: oauth.loginLabel },
      }))
  }

  // ---- App-owned login/logout orchestration ----

  /**
   * Run a provider's OAuth login flow and persist the returned credential.
   * @param provider - an installed catalog provider route with an OAuth flow.
   * @param interaction - the login interaction (prompts + notifications).
   * @returns the persisted credential.
   * @throws LlmError when the provider has no OAuth flow.
   */
  async login(provider: string, interaction: AuthInteraction): Promise<Credential> {
    const oauth = builtinProviders().find(entry => entry.id === provider)?.auth.oauth
    if (oauth === undefined) {
      throw new LlmError(
        `llm-oauth: provider "${provider}" has no subscription login flow;`
        + ` available: ${this.loginableProviders().map(p => p.id).join(', ') || 'none'}`,
        'NO_OAUTH',
      )
    }
    const credential = await oauth.login(interaction)
    await this.modify(provider, () => Promise.resolve(credential))
    return credential
  }

  /**
   * Remove the stored credential for one provider.
   * @param provider - provider route whose stored credential to delete.
   */
  logout(provider: string): Promise<void> {
    return this.delete(provider)
  }

  // ---- Persistence internals ----

  /** Queue a reload; only an invariant violation escaping the fan-out can reject it. */
  private queueRefresh(): void {
    void this.enqueue(async () => {
      try {
        await this.reconcileFromDisk()
      } catch (error) {
        this.ctx.logger.warn('llm-oauth: reload failed at %s; keeping the last good document', this.spec.filename)
        this.ctx.logger.warn(error)
      }
    })
  }

  /**
   * Re-read the on-disk document into the snapshot and publish any changed
   * provider entries. Throws when the document is unreadable or invalid so each
   * caller picks its policy — a reload warns and keeps the last good snapshot,
   * a write fails loud rather than overwriting a document it could not read.
   */
  private async reconcileFromDisk(): Promise<void> {
    await assertOwnerOnly(this.spec.filename)
    let text: string | undefined
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
      text = undefined
    }
    if (text === this.text) return
    /* v8 ignore next -- dispose can land during the in-flight read */
    if (this.isClosed()) return
    const next = text === undefined ? new Map<string, Credential>() : parseOAuthDocument(text, this.spec.filename)
    const changed = changedProviders(this.values, next)
    this.text = text
    this.values = next
    for (const provider of changed) this.notifyUpdated(provider)
  }

  /** Boot read: an absent file is an empty store; an invalid one fails activation. */
  private async loadInitial(): Promise<void> {
    await assertOwnerOnly(this.spec.filename)
    let text: string
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
      return
    }
    this.values = parseOAuthDocument(text, this.spec.filename)
    this.text = text
  }

  /** Persist one provider's credential with an atomic owner-only replace. */
  private async persistSet(provider: string, value: Credential): Promise<void> {
    const nextText = renderDocument(this.text, provider, value)
    // 0600: a document holding tokens is never world-readable; 0700 parent
    // because the harness home holds user-private data.
    await writeFileAtomic(this.spec.filename, nextText, { mode: 0o600, dirMode: 0o700 })
    this.text = nextText
    this.values.set(provider, value)
    this.notifyUpdated(provider)
  }

  /** Remove one provider's credential with an atomic owner-only replace. */
  private async persistDelete(provider: string): Promise<void> {
    const nextText = renderDocument(this.text, provider, undefined)
    await writeFileAtomic(this.spec.filename, nextText, { mode: 0o600, dirMode: 0o700 })
    this.text = nextText
    this.values.delete(provider)
    this.notifyUpdated(provider)
  }

  /** Fan `llm/oauth-updated` out with contained listener failures. */
  private notifyUpdated(provider: string): void {
    let invariantFailure: unknown
    for (const listener of this.ctx.events.dispatch('emit', ['llm/oauth-updated', provider]) as Array<(p: string) => unknown>) {
      try {
        const returned = listener(provider)
        if (returned != null && typeof (returned as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(returned as PromiseLike<unknown>).then(undefined, (error: unknown) => {
            this.warnListenerFailure(provider, error)
          })
        }
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === 'INVARIANT') {
          invariantFailure ??= error
          continue
        }
        this.warnListenerFailure(provider, error)
      }
    }
    if (invariantFailure !== undefined) throw invariantFailure as Error
  }

  /** Contained-listener diagnostic shared by the sync and async failure paths. */
  private warnListenerFailure(provider: string, error: unknown): void {
    this.ctx.logger.warn('llm-oauth: an llm/oauth-updated listener for "%s" failed', provider)
    this.ctx.logger.warn(error)
  }
}

/** Provider ids whose stored credential differs between two snapshots. */
function changedProviders(prev: Map<string, Credential>, next: Map<string, Credential>): string[] {
  const changed: string[] = []
  for (const provider of new Set([...prev.keys(), ...next.keys()])) {
    if (credentialToken(prev.get(provider)) === credentialToken(next.get(provider))) continue
    changed.push(provider)
  }
  return changed
}

/** A comparison token for one stored credential; oauth carries an access token, api-key its key. */
function credentialToken(credential: Credential | undefined): unknown {
  if (credential?.type === 'oauth') return credential.access
  /* v8 ignore next -- parse rejects non-oauth entries; api_key exists only in an in-memory modify */
  return credential?.type === 'api_key' ? credential.key : undefined
}

export default LlmOAuthService
