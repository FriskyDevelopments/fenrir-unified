const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const registryKey = (username) => `bot:${String(username).toLowerCase()}`;
const isAdmin = (request, env) => {
  const expected = env.BOT_OS_ADMIN_TOKEN?.trim();
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && received && received === expected);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/healthz') return json({ status: 'ok', environment: 'quality', service: 'frisky-bot-os' });

    if (url.pathname === '/api/bots' && request.method === 'GET') {
      const entries = await env.BOT_REGISTRY.list({ prefix: 'bot:' });
      const bots = await Promise.all(entries.keys.map(async ({ name }) => JSON.parse(await env.BOT_REGISTRY.get(name))));
      return json(bots);
    }

    if (url.pathname === '/api/bots' && request.method === 'POST') {
      if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
      const bot = await request.json().catch(() => null);
      if (!bot || bot.environment !== 'quality' || bot.botType !== 'community' || !bot.telegramUsername || !bot.origin) {
        return json({ error: 'invalid_quality_community_blueprint' }, 400);
      }
      const record = { ...bot, registeredAt: new Date().toISOString(), status: 'active' };
      await env.BOT_REGISTRY.put(registryKey(bot.telegramUsername), JSON.stringify(record));
      return json(record, 201);
    }

    return json({ error: 'not_found' }, 404);
  },
};
