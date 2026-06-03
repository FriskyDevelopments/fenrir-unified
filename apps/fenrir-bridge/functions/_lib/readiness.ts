import type { OAuthEnv } from "./oauth";

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "ready", "configured"].includes((value ?? "").trim().toLowerCase());
}

export type ReadinessSnapshot = {
  ok: true;
  auth: {
    googleConfigured: boolean;
    microsoftConfigured: boolean;
    appleConfigured: boolean;
  };
  billing: {
    stripeSecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    priceIdsConfigured: boolean;
    telegramBotConfigured: boolean;
    telegramBotUsernameConfigured: boolean;
    telegramStarsConfigured: boolean;
    telegramWebhookSecretConfigured: boolean;
    d1Configured: boolean;
    neonConfigured: boolean;
  };
  app: {
    readyForPaidUsers: boolean;
  };
};

export function computeReadiness(env: OAuthEnv): ReadinessSnapshot {
  // WorkOS AuthKit is the primary social/email broker and covers all three
  // providers once configured; direct OAuth remains as a per-provider fallback.
  const workosEnv = env as OAuthEnv & { WORKOS_CLIENT_ID?: string; WORKOS_API_KEY?: string };
  const workosConfigured = nonEmpty(workosEnv.WORKOS_CLIENT_ID) && nonEmpty(workosEnv.WORKOS_API_KEY);
  const directGoogle = nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET);
  const directMicrosoft = nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET);
  const directApple = nonEmpty(env.APPLE_CLIENT_ID) && nonEmpty(env.APPLE_TEAM_ID) && nonEmpty(env.APPLE_KEY_ID) && nonEmpty(env.APPLE_PRIVATE_KEY);

  const auth = {
    googleConfigured: workosConfigured || directGoogle,
    microsoftConfigured: workosConfigured || directMicrosoft,
    appleConfigured: workosConfigured || directApple
  };

  const telegramBotConfigured = nonEmpty(env.TELEGRAM_BOT_TOKEN) || nonEmpty(env.TELEGRAM_PROD_BOT_TOKEN);
  const telegramBotUsernameConfigured = nonEmpty(env.FENRIR_TELEGRAM_BOT_USERNAME) || nonEmpty(env.MYFENRIR_TELEGRAM_BOT_USERNAME);
  const billing = {
    stripeSecretConfigured: nonEmpty(env.STRIPE_SECRET_KEY),
    webhookSecretConfigured: nonEmpty(env.STRIPE_WEBHOOK_SECRET),
    priceIdsConfigured:
      nonEmpty(env.STRIPE_STARTER_PRICE_ID) &&
      nonEmpty(env.STRIPE_PRO_PRICE_ID) &&
      nonEmpty(env.STRIPE_OPERATOR_PRICE_ID),
    telegramBotConfigured,
    telegramBotUsernameConfigured,
    telegramStarsConfigured: telegramBotConfigured && telegramBotUsernameConfigured,
    telegramWebhookSecretConfigured: nonEmpty(env.TELEGRAM_WEBHOOK_SECRET),
    d1Configured: env.DB != null,
    neonConfigured: nonEmpty(env.NEON_DATABASE_URL)
  };

  const telegramPaidAccessReady =
    billing.telegramStarsConfigured &&
    billing.telegramWebhookSecretConfigured;
  const readyForPaidUsers =
    auth.googleConfigured &&
    auth.microsoftConfigured &&
    auth.appleConfigured &&
    billing.d1Configured &&
    billing.neonConfigured &&
    telegramPaidAccessReady;

  return {
    ok: true,
    auth,
    billing,
    app: { readyForPaidUsers }
  };
}
