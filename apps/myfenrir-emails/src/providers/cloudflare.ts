import type { ProviderEnv, SendInput, SendResult } from "./types";
import { toArray } from "./types";

// DEFAULT transport — Cloudflare Email Service native Workers binding.
// No API keys: env.EMAIL.send({ to, from, subject, html, text, attachments, headers }).
// Requires the sending domain (myfenrir.com) to be onboarded in Email Sending.
// This binding is Workers-only — it CANNOT live in the fenrir-bridge Pages
// project (wrangler rejects `send_email` for Pages), which is exactly why this
// dedicated Worker is the "real home" for the EMAIL binding.
export async function sendViaCloudflare(env: ProviderEnv, input: SendInput): Promise<SendResult> {
  if (!env.EMAIL) {
    return {
      ok: false,
      provider: "cloudflare",
      status: 500,
      error: "EMAIL binding not configured. Add [[send_email]] name='EMAIL' in wrangler.toml.",
      code: "E_NO_BINDING",
    };
  }
  const message: Record<string, unknown> = {
    to: toArray(input.to),
    from: input.fromName ? { email: input.fromEmail, name: input.fromName } : input.fromEmail,
    subject: input.subject,
    html: input.html,
  };
  if (input.text) message.text = input.text;
  if (input.replyTo) message.replyTo = input.replyTo;
  if (input.headers) message.headers = input.headers;
  if (input.attachments?.length) {
    message.attachments = input.attachments.map((a) => ({
      content: a.content, // base64 string is accepted
      filename: a.filename,
      type: a.type,
      disposition: a.disposition ?? "attachment",
      ...(a.contentId ? { contentId: a.contentId } : {}),
    }));
  }
  try {
    const res = await env.EMAIL.send(message);
    return { ok: true, provider: "cloudflare", id: res.messageId, status: 202 };
  } catch (e: any) {
    // Cloudflare throws Error with .code (E_SENDER_NOT_VERIFIED, E_RATE_LIMIT_EXCEEDED, ...)
    const code = e?.code as string | undefined;
    const status =
      code === "E_SENDER_NOT_VERIFIED" ||
      code === "E_SENDER_DOMAIN_NOT_AVAILABLE" ||
      code === "E_SENDER_DOMAIN_NOT_CONFIGURED"
        ? 400
        : 502;
    return {
      ok: false,
      provider: "cloudflare",
      status,
      error: e?.message ?? "Cloudflare Email Service send failed",
      code,
    };
  }
}
