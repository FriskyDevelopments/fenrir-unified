/**
 * Fenrir Image Guard — Prompt Builder
 *
 * Constructs the vision prompt with per-tenant overrides.
 * The prompt instructs the model to return structured PERSON/APPROPRIATE/ENTERING fields.
 */

import type { TenantConfig } from "./types.js";

const DEFAULT_PROMPT = `Analyze this image for a security gate system.

Answer these three questions:
1. Is there a person clearly visible in the photo?
2. Is the content appropriate for a general audience (no nudity, violence, gore, or sensitive content)?
3. Does it appear the person is entering a room or doorway (approaching, stepping through, or standing at an entrance)?

You MUST respond ONLY in this exact format, nothing else:
PERSON:Yes or PERSON:No
APPROPRIATE:Yes or APPROPRIATE:No
ENTERING:Yes or ENTERING:No`;

/**
 * Build the vision prompt for a given tenant configuration.
 * If the tenant provides a custom prompt, use it directly.
 * Otherwise, construct from default template with tenant-specific adjustments.
 */
export function buildPrompt(tenant?: Partial<TenantConfig>): string {
  // Full custom prompt override
  if (tenant?.prompt) {
    return tenant.prompt;
  }

  // Build from defaults with per-tenant adjustments
  const checks: string[] = [];
  let questionNum = 1;

  if (tenant?.requirePerson !== false) {
    checks.push(`${questionNum}. Is there a person clearly visible in the photo?`);
    questionNum++;
  }

  if (tenant?.requireAppropriate !== false) {
    checks.push(`${questionNum}. Is the content appropriate for a general audience (no nudity, violence, gore, or sensitive content)?`);
    questionNum++;
  }

  if (tenant?.requireEntering !== false) {
    checks.push(`${questionNum}. Does it appear the person is entering a room or doorway (approaching, stepping through, or standing at an entrance)?`);
  }

  // If all checks are enabled, use the compact default (better model compliance)
  if (
    tenant?.requirePerson !== false &&
    tenant?.requireAppropriate !== false &&
    tenant?.requireEntering !== false
  ) {
    return DEFAULT_PROMPT;
  }

  // Build a custom prompt with only the required checks
  const fields: string[] = [];
  if (tenant?.requirePerson !== false) fields.push("PERSON:Yes or PERSON:No");
  if (tenant?.requireAppropriate !== false) fields.push("APPROPRIATE:Yes or APPROPRIATE:No");
  if (tenant?.requireEntering !== false) fields.push("ENTERING:Yes or ENTERING:No");

  return [
    "Analyze this image for a security gate system.",
    "",
    "Answer these questions:",
    ...checks,
    "",
    "You MUST respond ONLY in this exact format, nothing else:",
    ...fields,
  ].join("\n");
}

/**
 * Returns the default prompt (useful for testing/logging).
 */
export function getDefaultPrompt(): string {
  return DEFAULT_PROMPT;
}
