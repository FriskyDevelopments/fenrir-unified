import type { ProviderEnv, SendInput, SendResult } from "./types";
import { toArray } from "./types";

// FALLBACK transport — MailerSend REST API. Requires MAILERSEND_API_KEY secret
// and a verified sending domain on the MailerSend account.
export async function sendViaMailerSend(env: ProviderEnv, input: SendInput): Promise<SendResult> {
  if (!env.MAILERSEND_API_KEY) {
    return { ok: false, provider: "mailersend", status: 500, error: "MAILERSEND_API_KEY not set", code: "E_NO_KEY" };
  }
  const payload: Record<string, unknown> = {
    from: { email: input.fromEmail, ...(input.fromName ? { name: input.fromName } : {}) },
    to: toArray(input.to).map((email) => ({ email })),
    subject: input.subject,
    html: input.html,
  };
  if (input.text) payload.text = input.text;
  if (input.replyTo) payload.reply_to = { email: input.replyTo };
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content, // base64
      disposition: a.disposition ?? "attachment",
      ...(a.contentId ? { id: a.contentId } : {}),
    }));
  }
  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MAILERSEND_API_KEY}`,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    return {
      ok: false,
      provider: "mailersend",
      status: res.status,
      error: data?.message ?? "MailerSend send failed",
      code: String(res.status),
    };
  }
  // MailerSend returns 202 with X-Message-Id header and empty body.
  return { ok: true, provider: "mailersend", id: res.headers.get("x-message-id") ?? undefined, status: 202 };
}
