/**
 * Fenrir Image Guard — Types
 *
 * Reusable image moderation middleware for any Fenrir/casa bot.
 * Checks photos for: person presence, content appropriateness, entry detection.
 */

// ── Vision analysis result ────────────────────────────────

export interface VisionResult {
  /** Is a person visible in the image? */
  personDetected: boolean;
  /** Is the content appropriate for a general audience? */
  appropriate: boolean;
  /** Does it look like the person is entering a room/space? */
  entering: boolean;
  /**
   * The classifier was not confident enough to decide on its own — a human
   * has to look. Uncertainty is never resolved by rejecting.
   */
  needsReview?: boolean;
  /** Raw model response for debugging/logging */
  raw: string;
  /** Which model actually answered (after fallback chain) */
  model: string;
  /** Latency in ms */
  latencyMs: number;
}

// ── Decision the middleware makes ─────────────────────────

export type GuardDecision =
  | "allow"
  /** Uncertain — queued for a human. NOT a rejection: nothing is destroyed. */
  | "needs_review"
  | "reject_no_person"
  | "reject_inappropriate"
  | "reject_not_entering"
  | "error";

export interface GuardVerdict {
  decision: GuardDecision;
  result: VisionResult | null;
  /** Human-readable reason (localized later by the caller) */
  reason: string;
}

// ── Per-tenant configuration ──────────────────────────────

export interface TenantConfig {
  /** Tenant/workspace identifier */
  tenantId: string;
  /** Override the default vision prompt (optional) */
  prompt?: string;
  /** Whether "entering" check is required (default: true) */
  requireEntering?: boolean;
  /** Whether "person" check is required (default: true) */
  requirePerson?: boolean;
  /** Whether content appropriateness is enforced (default: true) */
  requireAppropriate?: boolean;
  /** Custom model override for this tenant (optional) */
  model?: string;
  /** Locale for response messages */
  locale?: "en" | "es" | "fr" | "de";
}

// ── Vision adapter configuration ──────────────────────────

export interface VisionAdapterConfig {
  /**
   * LiteLLM-compatible base URL (or OpenRouter).
   * e.g. "https://openrouter.ai/api/v1" or "http://localhost:4000"
   */
  baseUrl: string;
  /** API key for the gateway */
  apiKey: string;
  /** Primary model identifier (LiteLLM format, e.g. "google/gemini-1.5-flash") */
  primaryModel: string;
  /** Fallback model(s) tried in order if primary fails */
  fallbackModels: string[];
  /** Request timeout in ms (default: 15000) */
  timeoutMs?: number;
  /** Max tokens for the vision response (default: 150) */
  maxTokens?: number;
}

// ── Image Guard full config (combines adapter + defaults) ─

export interface ImageGuardConfig {
  vision: VisionAdapterConfig;
  /** Default tenant config applied when no tenant override exists */
  defaults: Omit<TenantConfig, "tenantId">;
  /** Telegram bot token (for downloading photos) */
  botToken: string;
}
