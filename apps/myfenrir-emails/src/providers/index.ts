import type { ProviderEnv, SendInput, SendResult } from "./types";
import { sendViaCloudflare } from "./cloudflare";
import { sendViaResend } from "./resend";
import { sendViaMailerSend } from "./mailersend";

export type { SendInput, SendResult, SendAttachment, ProviderEnv, EmailBinding } from "./types";

export type ProviderId = "cloudflare" | "resend" | "mailersend";

export const PROVIDERS: ProviderId[] = ["cloudflare", "resend", "mailersend"];

function sendVia(provider: string, env: ProviderEnv, input: SendInput): Promise<SendResult> {
  switch ((provider || "cloudflare").toLowerCase()) {
    case "resend":
      return sendViaResend(env, input);
    case "mailersend":
      return sendViaMailerSend(env, input);
    case "cloudflare":
    default:
      return sendViaCloudflare(env, input);
  }
}

// Dispatch a send to the selected transport, with automatic FALLBACK.
// `provider` comes from the request body (optional) or EMAIL_PROVIDER
// (default "cloudflare"). If the primary transport fails with an
// infrastructure error (no binding / no key / domain not configured / 5xx),
// we transparently try the fallback chain so a single mis-provisioned rail
// never drops a transactional email. Genuine 4xx (e.g. bad recipient) do not
// cascade. `fallback` is a comma-separated env var, e.g. "resend,mailersend".
export async function dispatchSend(
  provider: string,
  env: ProviderEnv & { EMAIL_FALLBACK?: string },
  input: SendInput,
): Promise<SendResult & { fellBackFrom?: string }> {
  const primary = (provider || "cloudflare").toLowerCase();
  const first = await sendVia(primary, env, input);
  if (first.ok) return first;

  // Only cascade on infra failures, not on hard client errors.
  const infraCodes = new Set(["E_NO_BINDING", "E_NO_KEY", "E_SENDER_DOMAIN_NOT_CONFIGURED"]);
  const shouldFallback = infraCodes.has(first.code ?? "") || first.status >= 500;
  if (!shouldFallback) return first;

  const chain = (env.EMAIL_FALLBACK ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((p) => p && p !== primary && PROVIDERS.includes(p as ProviderId));

  for (const fb of chain) {
    const r = await sendVia(fb, env, input);
    if (r.ok) return { ...r, fellBackFrom: `${primary}:${first.code ?? first.status}` };
  }
  return first; // nothing worked — surface the original failure
}
