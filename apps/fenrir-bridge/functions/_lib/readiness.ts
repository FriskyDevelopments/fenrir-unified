import { isDirectOAuthAvailable, type OAuthEnv } from "./oauth";

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
    friskyAuthEnabled: boolean;
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

export type ManagedTelegramRail = {
  starsConfigured: boolean;
  webhookConfigured: boolean;
};

export function computeReadiness(
  env: OAuthEnv,
  managedRail: ManagedTelegramRail = { starsConfigured: false, webhookConfigured: false }
): ReadinessSnapshot {
  const directGoogle = nonEmpty(env.GOOGLE_CLIENT_ID) && nonEmpty(env.GOOGLE_CLIENT_SECRET);
  const directMicrosoft = nonEmpty(env.MICROSOFT_CLIENT_ID) && nonEmpty(env.MICROSOFT_CLIENT_SECRET);
  // Community OAuth signs the Apple client secret from the p8 at exchange time.
  const directApple = isDirectOAuthAvailable("apple", env);

  const auth = {
    googleConfigured: directGoogle,
    microsoftConfigured: directMicrosoft,
    appleConfigured: directApple,
    friskyAuthEnabled: enabled(env.FRISKY_AUTH_ENABLED)
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
    // Bot OS owns the production bot and canonical webhook. Do not falsely
    // require duplicate secrets in the Pages dashboard runtime.
    telegramStarsConfigured: (telegramBotConfigured && telegramBotUsernameConfigured) || managedRail.starsConfigured,
    telegramWebhookSecretConfigured: nonEmpty(env.TELEGRAM_WEBHOOK_SECRET) || managedRail.webhookConfigured,
    d1Configured: env.DB != null,
    neonConfigured: nonEmpty(env.NEON_DATABASE_URL)
  };

  const hasPrimaryAuth =
    auth.googleConfigured ||
    auth.microsoftConfigured ||
    auth.appleConfigured ||
    auth.friskyAuthEnabled;
  const telegramPaidAccessReady =
    billing.telegramStarsConfigured &&
    billing.telegramWebhookSecretConfigured;
  // For non-Stripe Telegram Stars + D1 go-live path, require:
  // - at least one auth provider ("OAuth" in launch checklist),
  // - D1 + Neon for app state + community gate,
  // - Telegram Stars rail (bot + webhook).
  const readyForPaidUsers =
    hasPrimaryAuth &&
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
