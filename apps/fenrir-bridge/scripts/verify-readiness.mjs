const DEFAULT_HOSTS = ['https://myfenrir.com', 'https://www.myfenrir.com'];

const hosts = (process.env.FENRIR_VERIFY_HOSTS ?? DEFAULT_HOSTS.join(','))
  .split(',')
  .map((host) => host.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const sessionCookie = process.env.FENRIR_SESSION_COOKIE?.trim();
const expectPaidReady = process.env.FENRIR_EXPECT_PAID_READY !== 'false';

let failures = 0;

function fail(message) {
  console.error(`FAIL ${message}`);
  failures += 1;
}

function ok(message) {
  console.log(`OK   ${message}`);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, text };
  }
}

async function verifyUnauthenticated(base) {
  const response = await fetch(`${base}/api/readiness`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await readJson(response);

  if (response.status !== 401 || body?.error !== 'authentication_required') {
    fail(
      `${base}/api/readiness unauthenticated expected 401 authentication_required, got HTTP ${response.status}`
    );
    return;
  }

  ok(`${base}/api/readiness rejects anonymous users`);
}

function verifyReadinessShape(base, body) {
  const requiredBooleans = [
    ['auth.googleConfigured', body?.auth?.googleConfigured],
    ['auth.microsoftConfigured', body?.auth?.microsoftConfigured],
    ['auth.appleConfigured', body?.auth?.appleConfigured],
    ['billing.telegramBotConfigured', body?.billing?.telegramBotConfigured],
    ['billing.telegramBotUsernameConfigured', body?.billing?.telegramBotUsernameConfigured],
    ['billing.telegramStarsConfigured', body?.billing?.telegramStarsConfigured],
    ['billing.telegramWebhookSecretConfigured', body?.billing?.telegramWebhookSecretConfigured],
    ['billing.d1Configured', body?.billing?.d1Configured],
    ['app.readyForPaidUsers', body?.app?.readyForPaidUsers],
  ];

  for (const [key, value] of requiredBooleans) {
    if (typeof value !== 'boolean') {
      fail(`${base}/api/readiness missing boolean ${key}`);
    }
  }
}

async function verifyAuthenticated(base) {
  const response = await fetch(`${base}/api/readiness`, {
    headers: {
      Accept: 'application/json',
      Cookie: sessionCookie,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await readJson(response);

  if (response.status !== 200 || body?.ok !== true) {
    fail(`${base}/api/readiness authenticated expected 200 ok:true, got HTTP ${response.status}`);
    return;
  }

  verifyReadinessShape(base, body);

  if (expectPaidReady && body?.app?.readyForPaidUsers !== true) {
    fail(`${base}/api/readiness app.readyForPaidUsers is not true`);
    return;
  }

  ok(
    `${base}/api/readiness authenticated launch gate${expectPaidReady ? ' is ready' : ' shape is valid'}`
  );
}

for (const base of hosts) {
  try {
    await verifyUnauthenticated(base);
    if (sessionCookie) {
      await verifyAuthenticated(base);
    } else {
      console.log(
        `SKIP ${base}/api/readiness authenticated check; set FENRIR_SESSION_COOKIE to verify readyForPaidUsers`
      );
    }
  } catch (error) {
    fail(
      `${base}/api/readiness request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

process.exit(failures === 0 ? 0 : 1);
