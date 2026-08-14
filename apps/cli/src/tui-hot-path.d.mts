/**
 * Type declarations for {@link ./tui-hot-path.mjs}.
 *
 * The implementation is plain ESM so source `pnpm dsh` can classify argv
 * before deciding whether to boot under bun or Node+tsx.
 * @module @deepseek-ai/dsh/tui-hot-path
 */

/** Minimum bun the OMP TUI engine declares (`engines.bun`). */
export declare const TUI_BUN_MIN_VERSION: string

/**
 * @param raw - `bun --version` stdout, possibly with a build suffix.
 * @returns whether `raw` is at least {@link TUI_BUN_MIN_VERSION}.
 */
export declare function bunVersionSatisfies(raw: string): boolean

/**
 * @param versions - `process.versions`, or a test double with optional `bun`.
 * @returns whether this process is already bun.
 */
export declare function isBunRuntime(versions?: { bun?: string; node?: string }): boolean

/** @returns the stderr line written when bun is missing or too old. */
export declare function missingBunMessage(): string

/** @returns whether PATH has a bun that meets the TUI engine floor. */
export declare function hasUsableBun(): boolean

/** Source-launch classification used to decide whether bun is required/optional. */
export type SourceLaunchKind = 'tui' | 'headless' | 'login' | 'node'

/**
 * Classify source `pnpm dsh` argv into the runtime it needs.
 * @param argv - arguments after the launcher script.
 * @returns 'tui' | 'headless' | 'login' | 'node'.
 */
export declare function classifySourceLaunch(argv: readonly string[]): SourceLaunchKind

/**
 * Whether source `pnpm dsh` must exec bun before loading `bin.ts`.
 * True only for a tui profile boot. Missing bun is a usage error.
 * @param argv - arguments after the launcher script.
 */
export declare function wantsTuiBunHotPath(argv: readonly string[]): boolean

/**
 * Whether source `pnpm dsh` may exec bun when a usable bun is on PATH.
 * Headless and login do not need `bun:ffi`; Node+tsx remains the fallback.
 * @param argv - arguments after the launcher script.
 */
export declare function wantsOptionalBunHotPath(argv: readonly string[]): boolean
