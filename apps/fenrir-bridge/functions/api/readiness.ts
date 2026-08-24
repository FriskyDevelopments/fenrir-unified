import { readSession } from "../_lib/auth";
import type { BillingEnv } from "../_lib/billing-env";
import { computeReadiness, type ManagedTelegramRail } from "../_lib/readiness";
import { noStoreJson } from "../_lib/responses";

const BOT_OS_READINESS_URL = "https://gate.myfenrir.com/api/readiness?community=myfenrir-core";
const STARS_BOT_HEALTH_URL = "https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/telegram/bot-health";

async function fetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    return { ok: response.ok, body: await response.json().catch(() => null) };
  } catch {
    return { ok: false, body: null };
  } finally {
    clearTimeout(timer);
  }
}

async function managedTelegramRail(): Promise<ManagedTelegramRail> {
  const [gate, stars] = await Promise.all([fetchJson(BOT_OS_READINESS_URL), fetchJson(STARS_BOT_HEALTH_URL)]);
  const gateBody = gate.body as { ok?: boolean; bot?: { reachable?: boolean }; webhook?: { configured?: boolean; canonical?: boolean } } | null;
  const starsBody = stars.body as { ok?: boolean; username?: string } | null;
  const gateReady = gate.ok && gateBody?.ok === true && gateBody.bot?.reachable === true;
  return {
    starsConfigured: stars.ok && starsBody?.ok === true && Boolean(starsBody.username),
    webhookConfigured: gateReady && gateBody?.webhook?.configured === true && gateBody.webhook?.canonical === true
  };
}

export async function onRequestGet(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  return noStoreJson(computeReadiness(context.env, await managedTelegramRail()));
}
