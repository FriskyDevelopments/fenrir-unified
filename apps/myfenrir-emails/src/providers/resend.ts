import type { ProviderEnv, SendInput, SendResult } from "./types";
import { toArray } from "./types";

// FALLBACK transport — Resend REST API. Requires RESEND_API_KEY secret and a
// verified sending domain on the Resend account. Today the account has
// `hostcasa.app` verified; to send Resend-from-@myfenrir.com you must also
// verify myfenrir.com in Resend (the Cloudflare default needs no such step).
export async function sendViaResend(env: ProviderEnv, input: SendInput): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, provider: "resend", status: 500, error: "RESEND_API_KEY not set", code: "E_NO_KEY" };
  }
  const from = input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail;
  const payload: Record<string, unknown> = {
    from,
    to: toArray(input.to),
    subject: input.subject,
    html: input.html,
  };
  if (input.text) payload.text = input.text;
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (input.headers) payload.headers = input.headers;
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content, // base64
      content_type: a.type,
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      provider: "resend",
      status: res.status,
      error: data?.message ?? data?.name ?? "Resend send failed",
      code: data?.name,
    };
  }
  return { ok: true, provider: "resend", id: data?.id, status: 202 };
}
