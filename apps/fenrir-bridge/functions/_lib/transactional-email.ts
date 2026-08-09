import type { BillingEnv } from "./billing-env";

/**
 * Remitente único de todo el correo saliente de Fenrir.
 *
 * Va en la RAÍZ, no en `mail.`, porque ahí es donde está la identidad que
 * autentica: `myfenrir.com` tiene SPF y DKIM (`cf2024-1._domainkey`), mientras
 * que `mail.myfenrir.com` solo tiene un DMARC `p=reject` sin SPF ni DKIM que lo
 * respalden — todo lo enviado desde ese subdominio se RECHAZA de plano, sin
 * caer siquiera en spam. Mantener los dos remitentes vivos hacía que el correo
 * transaccional se perdiera en silencio.
 */
export const FENRIR_MAIL_FROM = { email: "noreply@myfenrir.com", name: "MyFenrir" } as const;

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));

export async function sendBillingEmail(env: BillingEnv, input: { to: string; subject: string; title: string; body: string; status: string; detail: string }) {
  if (!env.EMAIL || !input.to || input.to.endsWith("@unknown")) return;
  const html = '<!doctype html><html><body style="margin:0;background:#050505;color:#ECEEFF;font-family:Arial"><div style="padding:48px 16px;background:radial-gradient(circle at 15% 0,#39207B 0,transparent 38%),#050505"><div style="max-width:680px;margin:auto;border:1px solid rgba(236,238,255,.18);border-radius:30px;overflow:hidden;background:#0B0E1A"><div style="padding:38px 42px;background:linear-gradient(135deg,rgba(139,124,255,.18),rgba(79,215,224,.08))"><img src="https://myfenrir.com/fenrir-splash-icon.svg" width="76" height="76" alt="Fenrir"><div style="margin-top:18px;font:bold 12px Arial;letter-spacing:3px;color:#4FD7E0">MYFENRIR // THE PACK</div><div style="margin-top:12px;font:bold 30px Arial">FENRIR<span style="color:#8B7CFF">.</span></div></div><div style="padding:48px 42px"><div style="display:inline-block;padding:8px 12px;border:1px solid rgba(79,215,224,.4);border-radius:999px;color:#4FD7E0;font:bold 11px Arial;letter-spacing:1.5px">'+esc(input.status)+'</div><h1 style="font:bold 44px Arial">'+esc(input.title)+'</h1><p style="font:18px/1.75 Arial;color:#CFD3E8">'+esc(input.body)+'</p><div style="margin-top:30px;padding:20px 24px;border-radius:18px;background:rgba(255,255,255,.045);font:14px/1.8 Arial;color:#AEB5D0">'+esc(input.detail)+'</div></div><div style="padding:22px 42px;border-top:1px solid rgba(236,238,255,.12);font:12px Arial;color:#858BA8">Fenrir Protocol · <a href="https://myfenrir.com/wiki" style="color:#4FD7E0">Visit our Fenrir Wiki →</a></div></div></div></body></html>';
  await env.EMAIL.send({ to: input.to, from: FENRIR_MAIL_FROM, subject: input.subject, html, text: input.title+'\n\n'+input.body+'\n\n'+input.detail+'\n\nhttps://myfenrir.com/wiki' });
}
