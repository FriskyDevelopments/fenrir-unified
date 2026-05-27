import type { BillingEnv } from "./billing-env";

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

export function computeReadiness(env: BillingEnv): ReadinessSnapshot {
  const supabaseConfigured = nonEmpty(env.SUPABASE_URL) && nonEmpty(env.SUPABASE_ANON_KEY);
  const auth = {
    googleConfigured: supabaseConfigured && enabled(env.FENRIR_GOOGLE_OAUTH_CONFIGURED),
    microsoftConfigured: supabaseConfigured && enabled(env.FENRIR_MICROSOFT_OAUTH_CONFIGURED),
    appleConfigured: supabaseConfigured && enabled(env.FENRIR_APPLE_OAUTH_CONFIGURED)
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
