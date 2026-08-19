/**
 * Thin client that lets Pages Functions send BRANDED MyFenrir email through the
 * dedicated `myfenrir-emails` Worker (apps/myfenrir-emails), which owns the
 * Cloudflare Email Service `send_email` binding + Resend/MailerSend fallback.
 *
 * Why a Worker instead of a Pages `env.EMAIL` binding: wrangler rejects
 * `send_email` for Pages projects, so fenrir-bridge cannot bind Cloudflare
 * Email Service directly (see wrangler.jsonc). The Worker is the real home for
 * outbound mail; Pages calls it over HTTP.
 *
 * Non-destructive & backward-compatible:
 *   1) If MYFENRIR_EMAILS_URL (+ token) is configured  -> POST to the Worker,
 *      which renders the full branded template and picks provider+fallback.
 *   2) Else if a Pages `env.EMAIL` binding exists       -> send a compact,
 *      on-brand fallback shell directly (keeps today's behavior working).
 *   3) Else                                             -> { ok:false, notConfigured }.
 *
 * Secrets are never hard-coded. Set:
 *   MYFENRIR_EMAILS_URL   (var)    e.g. https://myfenrir-emails.<subdomain>.workers.dev
 *   MYFENRIR_EMAILS_TOKEN (secret) matches the Worker's SEND_AUTH_TOKEN
 */

export type MyFenrirEmailEnv = {
  MYFENRIR_EMAILS_URL?: string;
  MYFENRIR_EMAILS_TOKEN?: string;
  EMAIL?: {
    send?: (message: { to: string; from: { email: string; name?: string }; subject: string; html: string; text: string }) => Promise<unknown>;
    fetch?: (request: Request) => Promise<Response>;
  };
};

export type MyFenrirTemplateId =
  | "verificacion-codigo"
  | "acceso"
  | "bienvenida"
  | "cuenta-vinculada"
  | "notificacion"
  | "activacion-identidad"
  | "invitacion-lore"
  | "continuar-lore";

export const FENRIR_MAIL_FROM = { email: "noreply@mail.myfenrir.com", name: "MyFenrir" } as const;
export type MyFenrirEmailLocale = "en" | "es" | "fr" | "de";

export function emailLocaleFromTelegram(languageCode?: string | null): MyFenrirEmailLocale {
  const base = String(languageCode ?? "").trim().toLowerCase().replace("_", "-").split("-")[0];
  return (["en", "es", "fr", "de"] as const).includes(base as MyFenrirEmailLocale)
    ? base as MyFenrirEmailLocale
    : "en";
}

export interface SendTemplateInput {
  template: MyFenrirTemplateId;
  to: string;
  data?: Record<string, unknown>;
  subject?: string;
  brand?: string | Record<string, unknown>;
  locale?: MyFenrirEmailLocale;
  telegramLanguageCode?: string;
}

export interface SendTemplateResult {
  ok: boolean;
  via: "worker" | "binding" | "none";
  provider?: string;
  id?: string;
  error?: string;
}

export async function sendMyFenrirEmail(env: MyFenrirEmailEnv, input: SendTemplateInput): Promise<SendTemplateResult> {
  if (!input.to || input.to.endsWith("@unknown")) return { ok: false, via: "none", error: "invalid_recipient" };

  // (1) Preferred path: the dedicated Worker renders + sends (branded, with fallback).
  if (env.MYFENRIR_EMAILS_URL) {
    try {
      const res = await fetch(`${env.MYFENRIR_EMAILS_URL.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.MYFENRIR_EMAILS_TOKEN ? { Authorization: `Bearer ${env.MYFENRIR_EMAILS_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          template: input.template,
          to: input.to,
          data: input.data ?? {},
          subject: input.subject,
          brand: input.brand ?? "myfenrir",
          locale: input.locale ?? emailLocaleFromTelegram(input.telegramLanguageCode),
        }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) return { ok: true, via: "worker", provider: body.provider, id: body.id };
      return { ok: false, via: "worker", error: body?.error ?? `worker_${res.status}` };
    } catch (e: any) {
      // fall through to the binding path if the Worker is unreachable
      if (!env.EMAIL) return { ok: false, via: "worker", error: e?.message ?? "worker_unreachable" };
    }
  }

  // (2) Fallback path: send a compact on-brand shell via the Pages EMAIL binding.
  if (env.EMAIL) {
    const { subject, html, text } = renderFallback(input);
    const message = { to: input.to, from: FENRIR_MAIL_FROM, subject: input.subject ?? subject, html, text };
    try {
      if (typeof env.EMAIL.send === "function") {
        await env.EMAIL.send(message);
      } else if (typeof env.EMAIL.fetch === "function") {
        const response = await env.EMAIL.fetch(new Request("https://email.internal/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(message),
        }));
        if (!response.ok) throw new Error(`email_service_failed:${response.status}`);
      } else {
        return { ok: false, via: "binding", error: "email_binding_unavailable" };
      }
      return { ok: true, via: "binding" };
    } catch (e: any) {
      return { ok: false, via: "binding", error: e?.message ?? "binding_send_failed" };
    }
  }

  return { ok: false, via: "none", error: "email_not_configured" };
}

// ---- Compact, self-contained branded fallback (dark "Fenrir" shell) ---------
// Deliberately minimal — the rich templates live in apps/myfenrir-emails. This
// only runs when the Worker isn't configured, so delivery still looks on-brand.
const escFB = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

function shell(opts: { badge: string; title: string; intro: string; extraHtml?: string; ctaLabel?: string; ctaUrl?: string; note?: string }): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 4px;">
        <a href="${escFB(opts.ctaUrl)}" style="display:inline-block;padding:16px 34px;border-radius:12px;background:#00E5FF;color:#04121A;font:800 16px Arial;text-decoration:none;">${escFB(opts.ctaLabel)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#05060B;color:#CFD3E8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#05060B" style="background:#05060B;"><tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
    <tr><td style="padding:36px 40px 26px;background:#0B0E1A;border-radius:22px 22px 0 0;">
      <div style="font:800 11px Arial;letter-spacing:3px;color:#4FD7E0;">MYFENRIR &#47;&#47; THE PACK</div>
      <div style="margin-top:12px;font:900 30px Arial;color:#ECEEFF;">FENRIR<span style="color:#00E5FF;">.</span></div>
      <div style="margin-top:16px;"><span style="display:inline-block;padding:7px 15px;border:1px solid rgba(0,229,255,.42);background:rgba(0,229,255,.10);border-radius:999px;color:#00E5FF;font:800 11px Arial;letter-spacing:1.4px;text-transform:uppercase;">${escFB(opts.badge)}</span></div>
    </td></tr>
    <tr><td style="padding:34px 40px;background:#0B0E1A;border-left:1px solid rgba(150,166,224,.16);border-right:1px solid rgba(150,166,224,.16);">
      <h1 style="margin:0 0 16px;font:800 24px Arial;color:#ECEEFF;">${escFB(opts.title)}</h1>
      <p style="margin:0 0 18px;font:15px/1.7 Arial;color:#CFD3E8;">${opts.intro}</p>
      ${opts.extraHtml ?? ""}
      ${cta}
      ${opts.note ? `<p style="margin:18px 0 0;font:12px/1.7 Arial;color:#858BA8;">${opts.note}</p>` : ""}
    </td></tr>
    <tr><td style="padding:24px 40px 36px;background:#05060B;border-radius:0 0 22px 22px;">
      <div style="height:1px;background:rgba(150,166,224,.14);"></div>
      <div style="margin-top:16px;font:12px Arial;color:#858BA8;">Fenrir Protocol · <a href="https://myfenrir-docs.pages.dev/" style="color:#00E5FF;text-decoration:none;">MyFenrir Wiki →</a></div>
      <div style="margin-top:8px;font:11px Arial;color:#858BA8;">Enviado por MyFenrir · myfenrir.com</div>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function renderFallback(input: SendTemplateInput): { subject: string; html: string; text: string } {
  const d: any = input.data ?? {};
  switch (input.template) {
    case "acceso": {
      const url = String(d.url ?? "https://www.myfenrir.com/main");
      const mins = d.minutos ?? 15;
      return {
        subject: "Tu acceso a MyFenrir",
        html: shell({
          badge: "Acceso",
          title: "Entra con un solo toque",
          intro: "Toca el botón para entrar a MyFenrir. No necesitas contraseña — este enlace te identifica de forma segura.",
          ctaLabel: "Entrar a MyFenrir",
          ctaUrl: url,
          note: `El enlace caduca en ${escFB(mins)} minutos y solo puede usarse una vez. Si tú no lo pediste, ignóralo.`,
        }),
        text: `Entra a MyFenrir: ${url} (caduca en ${mins} minutos, un solo uso). Si tú no lo solicitaste, ignora este correo.`,
      };
    }
    case "verificacion-codigo": {
      const code = String(d.codigo ?? "");
      const mins = d.minutos ?? 15;
      return {
        subject: `${code} es tu código de verificación de MyFenrir`,
        html: shell({
          badge: "Verificación",
          title: "Confirma que eres tú",
          intro: "Usa este código para verificar tu cuenta MyFenrir.",
          extraHtml: `<table role="presentation" width="100%" style="border:1px solid rgba(0,229,255,.35);border-radius:16px;background:#121734;"><tr><td align="center" style="padding:24px;"><div style="font:700 34px 'SFMono-Regular',Consolas,monospace;letter-spacing:10px;color:#ECEEFF;">${escFB(code.split("").join(" "))}</div><div style="margin-top:10px;font:12px Arial;color:#AEB5D0;">Válido por ${escFB(mins)} minutos</div></td></tr></table>`,
          note: "Nunca compartas este código; MyFenrir jamás te lo pedirá. Si tú no lo solicitaste, ignora este correo.",
        }),
        text: `Tu código de verificación MyFenrir: ${code} (válido ${mins} min). No lo compartas.`,
      };
    }
    case "bienvenida":
      return {
        subject: "Bienvenido a la manada — MyFenrir",
        html: shell({
          badge: "Bienvenido",
          title: "Bienvenido a la manada",
          intro: "Tu cuenta MyFenrir está lista. Fenrir es tu identidad y tu llave para toda la manada.",
          ctaLabel: "Abrir mi panel",
          ctaUrl: String(d.ctaUrl ?? "https://www.myfenrir.com/main"),
        }),
        text: "Bienvenido a MyFenrir. Abre tu panel: https://www.myfenrir.com/main",
      };
    case "cuenta-vinculada":
      return {
        subject: "Tu Telegram quedó vinculado a MyFenrir",
        html: shell({
          badge: "Cuenta vinculada",
          title: "Vínculo confirmado",
          intro: "Conectaste tu Telegram con tu identidad Fenrir. Ya puedes usar la manada desde el bot.",
          ctaLabel: "Ver mi panel",
          ctaUrl: String(d.ctaUrl ?? "https://www.myfenrir.com/main"),
          note: "Si no fuiste tú, desvincúlalo desde tu panel y avísanos a hola@myfenrir.com.",
        }),
        text: "Tu Telegram quedó vinculado a MyFenrir. Si no fuiste tú, avísanos a hola@myfenrir.com.",
      };
    default:
      return {
        subject: String(input.subject ?? (d.titulo ?? "Notificación de MyFenrir")),
        html: shell({
          badge: "Notificación",
          title: String(d.titulo ?? "Notificación de MyFenrir"),
          intro: Array.isArray(d.parrafos) ? d.parrafos.map((x: unknown) => escFB(x)).join("<br><br>") : escFB(d.mensaje ?? ""),
          ctaLabel: d.ctaLabel,
          ctaUrl: d.ctaUrl,
        }),
        text: Array.isArray(d.parrafos) ? d.parrafos.join("\n\n") : String(d.mensaje ?? "Notificación de MyFenrir"),
      };
  }
}
