// dev-bot-quality.mjs — Quality-only webhook worker for @MyfenrirprotocolDEVbot.
//
// Purpose: make the DEV bot actually respond on Quality (which the minimal
// quality-preview worker does not handle). New, isolated worker — does NOT
// modify any existing worker. NEVER uses the prod bot token.
//
// Secrets (set via `wrangler secret put`, sourced from op — never inline):
//   TELEGRAM_DEV_BOT_TOKEN   -> token for @MyfenrirprotocolDEVbot (id 8783914357)
//   TELEGRAM_WEBHOOK_SECRET  -> shared secret; must match setWebhook secret_token
//
// Contract mirrors functions/api/telegram/webhook.ts: POST /api/telegram/webhook?bot=dev,
// validates x-telegram-bot-api-secret-token, channel must be "dev".

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const QUALITY_BOT_ORIGIN = 'https://myfenrir-dev-bot-quality.hrgrrtks2p.workers.dev';
const MYFENRIR_QUALITY_ORIGIN = 'https://quality.myfenrir.com';

// Public, secret-free handoff for the Frisky Bot OS community curator. This
// describes the Quality runtime; credentials and entitlement truth remain in
// their respective secret/D1 layers.
const BOT_OS_COMMUNITY_BLUEPRINT = {
  version: '1',
  environment: 'quality',
  botType: 'community',
  botName: 'MyFenrir Protocol DEV',
  telegramUsername: 'MyfenrirprotocolDEVbot',
  runtime: 'cloudflare-worker',
  webhookPath: '/api/telegram/webhook?bot=dev',
  media: {
    welcome: {
      en: '/fenrir-welcome-en.mp4',
      es: '/fenrir-welcome-es.mp4',
      de: '/fenrir-welcome-de.mp4',
      fr: '/fenrir-welcome-fr.mp4',
    },
  },
  gates: ['human-verification', 'identity', 'rules', 'vibe'],
  ownership: {
    factory: 'frisky-bot-os',
    runtime: 'fenrir-gatekeeper',
    entitlementTruth: 'fenrir-d1-and-stars',
  },
};

function welcomeVideoFor(languageCode) {
  const language = String(languageCode || 'en').toLowerCase();
  if (language.startsWith('es')) return `${QUALITY_BOT_ORIGIN}/fenrir-welcome-es.mp4`;
  if (language.startsWith('de')) return `${QUALITY_BOT_ORIGIN}/fenrir-welcome-de.mp4`;
  if (language.startsWith('fr')) return `${QUALITY_BOT_ORIGIN}/fenrir-welcome-fr.mp4`;
  return `${QUALITY_BOT_ORIGIN}/fenrir-welcome-en.mp4`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/.well-known/bot-os/community.json' && request.method === 'GET') {
      return json({ ...BOT_OS_COMMUNITY_BLUEPRINT, origin: QUALITY_BOT_ORIGIN });
    }
    if (url.pathname !== '/api/telegram/webhook') return json({ ok: false, error: 'not_found' }, 404);
    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
    if (url.searchParams.get('bot') !== 'dev') return json({ ok: false, error: 'wrong_channel' }, 400);

    const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!secret) return json({ ok: false, error: 'missing_TELEGRAM_WEBHOOK_SECRET' }, 503);
    if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
      return json({ ok: false, error: 'invalid_webhook_secret' }, 401);
    }
    const token = env.TELEGRAM_DEV_BOT_TOKEN?.trim();
    if (!token) return json({ ok: false, error: 'missing_TELEGRAM_DEV_BOT_TOKEN' }, 503);

    const update = await request.json().catch(() => null);
    const msg = update?.message;
    if (msg?.text) {
      const text = String(msg.text).trim();
      const linkCode = text.match(/^\/start\s+link_([A-Z0-9]{20})$/i)?.[1]?.toUpperCase();
      if (linkCode) {
        const linkSecret = env.TELEGRAM_LINK_CONFIRM_SECRET?.trim();
        const result = linkSecret
          ? await fetch(`${MYFENRIR_QUALITY_ORIGIN}/api/telegram/link/confirm`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${linkSecret}` },
              body: JSON.stringify({
                code: linkCode,
                telegramUserId: String(msg.from?.id || ''),
                telegramUsername: msg.from?.username || null,
              }),
            }).catch(() => null)
          : null;
        const linked = Boolean(result?.ok);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            text: linked
              ? '🐺 Your Telegram ID is linked to MyFenrir Quality. Return to the widget and refresh once.'
              : 'That MyFenrir link has expired or was already used. Generate a new one from the Telegram ID widget.',
          }),
        }).catch(() => {});
        return json({ ok: true });
      }
      if (text.startsWith('/start')) {
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            video: welcomeVideoFor(msg.from?.language_code),
            caption: [
              '🐺 *MyFenrir Quality* — dev bot en línea.',
              '',
              'Este es el entorno de prueba aislado.',
              'Escribe /status para confirmar el canal.',
            ].join('\n'),
            parse_mode: 'Markdown',
          }),
        }).catch(() => {});
        return json({ ok: true });
      }
      const reply = text === '/status'
        ? `🟢 *Quality online*\nBot OS channel: \`community\` · runtime: \`quality\`\nControl plane: ${env.BOT_OS_CONTROL_PLANE ? 'registered' : 'unlinked'}\nWebhook: healthy.`
        : 'Recibido en *MyFenrir Quality*. Usa /start o /status.';
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: msg.chat.id, parse_mode: 'Markdown', text: reply }),
      }).catch(() => {});
    }
    return json({ ok: true });
  },
};
