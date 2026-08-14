/**
 * Client-safe type surface of the subscription-login (OAuth) seam: the
 * non-secret status view a CLI command or configuration surface renders.
 * Types only — no runtime code.
 *
 * @module @deepseek-ai/dsh-llm-oauth/types
 */

/** Non-secret account info a status command renders for one provider. */
export interface LlmOAuthStatus {
  /** Provider route key (pi-ai catalog id). */
  provider: string
  /** Whether a durable OAuth credential currently resolves for this provider. */
  authenticated: boolean
  /** Human display name of the provider's subscription login, when known. */
  name?: string
}
