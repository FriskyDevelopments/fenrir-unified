// Self-contained BRANDED activation page for /activation/core and /activation/security.
// Replaces the old proxy to the (now-dead) Cloud Run cyberpup-* services. The page is
// the post-FriskyDev-login step that links the signed-in account to CyberPUP Core /
// Security, then hands off to the bot to finish the claim. No external upstream.
import { readSession, type AuthEnv } from './auth';

type BotKey = 'core' | 'security';

const BOTS: Record<
  BotKey,
  {
    label: string;
    short: string;
    accent: string;
    accent2: string;
    bot: string;
    tagline: string;
    blurb: string;
  }
> = {
  core: {
    label: 'CyberPUP Core',
    short: 'Core',
    accent: '#22c7a8',
    accent2: '#9ff4e4',
    bot: 'CyberPUPCorebot',
    tagline: 'Group operator · federation · inspection',
    blurb:
      'Core runs your group utilities, federation, and operator tooling. Activation links your FriskyDev account so Core recognizes you as an authorized operator.',
  },
  security: {
    label: 'CyberPUP Security',
    short: 'Security',
    accent: '#ff334e',
    accent2: '#ffb4bf',
    bot: 'CyberPUPSecuritybot',
    tagline: 'Defensive moderation · anti-spam · zero-tolerance',
    blurb:
      "Security is the pack's hard-moderation sentinel — anti-spam, banned keywords, anti-flood, flagged-account and zero-tolerance enforcement. Activation authorizes you to bind and administer it.",
  },
};

function esc(s: string): string {
  return (s || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}
function shortId(id: string): string {
  return (id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
}

const CSP =
  "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";

export async function renderActivation(
  request: Request,
  env: AuthEnv,
  bot: BotKey
): Promise<Response> {
  const cfg = BOTS[bot];
  const session = await readSession(request, env).catch(() => null);
  const url = new URL(request.url);

  const accountId = session?.frisky_account_id || '';
  const fd = accountId ? `FD-${shortId(accountId)}` : '';
  const startParam = accountId ? `activate_${accountId}` : 'activate';
  const botLink = `https://t.me/${cfg.bot}?start=${encodeURIComponent(startParam)}`;
  const loginLink = `/login?return=${encodeURIComponent(url.pathname)}`;

  const signedIn = Boolean(session);
  const body = signedIn
    ? `
      <p class="eyebrow">Signed in · Frisky ID</p>
      <div class="who">
        <div class="avatar">${esc((session!.name || session!.email || 'F').slice(0, 1).toUpperCase())}</div>
        <div>
          <div class="who-name">${esc(session!.name || 'FriskyDev member')}</div>
          <div class="who-mail">${esc(session!.email || '')}</div>
          ${fd ? `<div class="who-id">${esc(fd)}</div>` : ''}
        </div>
      </div>
      <p class="blurb">${esc(cfg.blurb)}</p>
      <a class="cta" href="${esc(botLink)}">Activate in @${esc(cfg.bot)} →</a>
      <p class="hint">Opens Telegram and starts the activation handoff for this account. The bot verifies your FriskyDev identity, then unlocks ${esc(cfg.short)}.</p>
      ${fd ? `<div class="payload"><span>Activation reference</span><code>${esc(fd)}</code></div>` : ''}
    `
    : `
      <p class="eyebrow">Frisky ID required</p>
      <p class="blurb">Sign in with your FriskyDev account to activate <b>${esc(cfg.label)}</b>. ${esc(cfg.blurb)}</p>
      <a class="cta" href="${esc(loginLink)}">Sign in with Frisky ID →</a>
      <p class="hint">You'll return here automatically to finish activation.</p>
    `;

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#080b0c"><title>Activate ${esc(cfg.label)} · MyFenrir</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{--acc:${cfg.accent};--acc2:${cfg.accent2};--ink:#eef6f3;--dim:#91a39e;--line:rgba(255,255,255,.10)}
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100dvh;font-family:Inter,system-ui,sans-serif;color:var(--ink);
    background:radial-gradient(900px 520px at 82% -8%,color-mix(in srgb,var(--acc) 20%,transparent),transparent 55%),
    radial-gradient(760px 460px at 8% 108%,rgba(34,199,168,.10),transparent 52%),
    linear-gradient(180deg,#0d0f10,#080b0c 48%,#040607);
    display:grid;place-items:center;padding:24px}
  .grid{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
    background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
    background-size:34px 34px;mask-image:radial-gradient(ellipse at 50% 30%,#000,transparent 78%)}
  .card{position:relative;z-index:1;width:min(520px,94vw);border-radius:22px;padding:30px 28px;
    background:rgba(255,255,255,.05);border:1px solid var(--line);backdrop-filter:blur(28px);
    box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 24px 70px rgba(0,0,0,.5)}
  .mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:18px;
    background:#0a0c0a;border:1px solid color-mix(in srgb,var(--acc) 40%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--acc) 30%,transparent)}
  .mark svg{width:26px;height:26px}
  h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:clamp(26px,5vw,34px);line-height:1.05;letter-spacing:-.01em;
    background:linear-gradient(90deg,#fff,var(--acc) 60%,var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{color:var(--dim);font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-top:8px}
  .eyebrow{font-family:"JetBrains Mono",monospace;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--acc2);margin:22px 0 10px}
  .who{display:flex;align-items:center;gap:13px;padding:14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line)}
  .avatar{width:46px;height:46px;border-radius:13px;flex:0 0 auto;display:grid;place-items:center;font-family:"Space Grotesk";font-weight:700;font-size:20px;color:#04140e;background:linear-gradient(135deg,var(--acc),var(--acc2))}
  .who-name{font-weight:600}.who-mail{color:var(--dim);font-size:13px}.who-id{font-family:"JetBrains Mono";font-size:11px;color:var(--acc);margin-top:2px}
  .blurb{color:#cbd5d1;font-size:14.5px;line-height:1.55;margin:16px 0}
  .cta{display:block;text-align:center;text-decoration:none;font-family:"Space Grotesk";font-weight:600;font-size:15px;color:#04140e;
    padding:15px;border-radius:13px;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 10px 30px color-mix(in srgb,var(--acc) 28%,transparent);transition:transform .15s}
  .cta:active{transform:scale(.99)}
  .hint{color:var(--dim);font-size:12.5px;line-height:1.5;margin-top:12px}
  .payload{margin-top:16px;padding:12px 14px;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px}
  .payload span{font-family:"JetBrains Mono";font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
  .payload code{font-family:"JetBrains Mono";font-size:14px;color:var(--acc)}
  .foot{margin-top:22px;padding-top:16px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}
  .foot span{font-family:"JetBrains Mono";font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
  .foot a{color:var(--acc2);text-decoration:none;font-size:12px}
</style></head>
<body><div class="grid"></div>
  <main class="card">
    <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="${cfg.accent}" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></span>
    <h1>Activate ${esc(cfg.label)}</h1>
    <p class="sub">${esc(cfg.tagline)}</p>
    ${body}
    <div class="foot"><span>🐺 MyFenrir · Frisky ID</span><a href="/">← myfenrir.com</a></div>
  </main>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'Cache-Control': 'no-store',
    },
  });
}
