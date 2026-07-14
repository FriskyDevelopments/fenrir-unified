import { describe, expect, it } from 'vitest';

import type { BillingEnv } from '../_lib/billing-env';
import { usdPriceForPaidPlan } from '../_lib/plan-catalog';
import {
  decodeWertClickId,
  sandboxMode,
  verifyWertWebhook,
  wertClickId,
  wertEnabled,
  wertWidgetOptions,
} from '../_lib/wert';
import { onRequestPost as wertWebhook } from '../api/wert/webhook';

const SECRET = 'wert_test_signing_secret';

const configuredEnv = {
  WERT_PARTNER_ID: 'partner_test',
  WERT_RECEIVING_WALLET: '0xWalletTest',
  WERT_WEBHOOK_SECRET: SECRET,
  WERT_ORIGIN: 'https://sandbox.wert.io',
} as BillingEnv;

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Minimal D1 stub that records upsertSubscription's prepared statements. */
function fakeDb() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    calls,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            run: async () => {
              calls.push({ sql, args });
              return { meta: { changes: 1 } };
            },
            first: async () => null,
          };
        },
      };
    },
  };
  return db;
}

function webhookRequest(body: string, signature: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-wert-signature'] = signature;
  return new Request('https://www.myfenrir.com/api/wert/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

describe('wert lib — gating', () => {
  it('wertEnabled requires partner id AND receiving wallet', () => {
    expect(wertEnabled({} as BillingEnv)).toBe(false);
    expect(wertEnabled({ WERT_PARTNER_ID: 'p' } as BillingEnv)).toBe(false);
    expect(wertEnabled(configuredEnv)).toBe(true);
  });

  it('sandboxMode reflects the origin', () => {
    expect(sandboxMode(configuredEnv)).toBe(true);
    expect(sandboxMode({ WERT_ORIGIN: 'https://widget.wert.io' } as BillingEnv)).toBe(false);
  });

  it('wertWidgetOptions returns null until configured', () => {
    expect(
      wertWidgetOptions({ env: {} as BillingEnv, plan: 'pro', orgId: 'o', userId: 'u', amountUsd: 7 })
    ).toBeNull();
  });

  it('wertWidgetOptions carries the binding + rounded amount', () => {
    const opts = wertWidgetOptions({
      env: configuredEnv,
      plan: 'pro',
      orgId: 'org-1',
      userId: 'user-1',
      amountUsd: 7.005,
    });
    expect(opts).not.toBeNull();
    expect(opts!.partner_id).toBe('partner_test');
    expect(opts!.address).toBe('0xWalletTest');
    expect(opts!.currency).toBe('USD');
    expect(opts!.currency_amount).toBe(7.01);
    expect(opts!.click_id).toBe('fenrir:pro:org-1:user-1');
    expect(opts!.extra.item_info.plan).toBe('pro');
  });
});

describe('wert lib — click_id codec', () => {
  it('round-trips plan/org/user', () => {
    const id = wertClickId('operator', 'org-9', 'user-9');
    expect(decodeWertClickId(id)).toEqual({ plan: 'operator', orgId: 'org-9', userId: 'user-9' });
  });

  it('rejects malformed or non-fenrir click ids', () => {
    expect(decodeWertClickId('')).toBeNull();
    expect(decodeWertClickId('cf:pro:telegram:1')).toBeNull();
    expect(decodeWertClickId('fenrir:bogusplan:o:u')).toBeNull();
    expect(decodeWertClickId('fenrir:pro:o')).toBeNull();
  });
});

describe('wert lib — usd price map', () => {
  it('defaults to the displayed monthly prices', () => {
    expect(usdPriceForPaidPlan({} as BillingEnv, 'starter')).toBe(3);
    expect(usdPriceForPaidPlan({} as BillingEnv, 'pro')).toBe(7);
    expect(usdPriceForPaidPlan({} as BillingEnv, 'operator')).toBe(15);
  });

  it('honours env overrides', () => {
    expect(usdPriceForPaidPlan({ WERT_PRO_USD: '9' } as BillingEnv, 'pro')).toBe(9);
  });
});

describe('wert lib — webhook signature', () => {
  it('verifies a correctly signed body and parses it', async () => {
    const body = JSON.stringify({ status: 'order_complete', order_id: 'w1' });
    const parsed = await verifyWertWebhook(body, await sign(SECRET, body), SECRET);
    expect(parsed).not.toBeNull();
    expect((parsed as { status: string }).status).toBe('order_complete');
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify({ status: 'order_complete' });
    expect(await verifyWertWebhook(body, 'deadbeef', SECRET)).toBeNull();
  });

  it('rejects when secret or signature is missing', async () => {
    const body = '{}';
    expect(await verifyWertWebhook(body, await sign(SECRET, body), undefined)).toBeNull();
    expect(await verifyWertWebhook(body, null, SECRET)).toBeNull();
  });
});

describe('wert webhook — grant path', () => {
  const grantEnv = () => ({ ...configuredEnv, DB: fakeDb() }) as unknown as BillingEnv & {
    DB: ReturnType<typeof fakeDb>;
  };

  it('401s on a bad signature', async () => {
    const env = grantEnv();
    const body = JSON.stringify({ status: 'order_complete', order_id: 'w1' });
    const res = await wertWebhook({ request: webhookRequest(body, 'bad'), env });
    expect(res.status).toBe(401);
    expect(env.DB.calls).toHaveLength(0);
  });

  it('does not grant on a non-final status', async () => {
    const env = grantEnv();
    const body = JSON.stringify({
      status: 'pending',
      order_id: 'w1',
      click_id: 'fenrir:pro:org-1:user-1',
      currency_amount: 7,
    });
    const res = await wertWebhook({ request: webhookRequest(body, await sign(SECRET, body)), env });
    const json = (await res.json()) as { granted: boolean };
    expect(json.granted).toBe(false);
    expect(env.DB.calls).toHaveLength(0);
  });

  it('grants PRO on a completed order and writes wert:<org> subscription', async () => {
    const env = grantEnv();
    const body = JSON.stringify({
      status: 'order_complete',
      order_id: 'w-42',
      click_id: 'fenrir:pro:org-1:user-1',
      currency_amount: 7,
    });
    const res = await wertWebhook({ request: webhookRequest(body, await sign(SECRET, body)), env });
    const json = (await res.json()) as { granted: boolean; plan: string };
    expect(json.granted).toBe(true);
    expect(json.plan).toBe('pro');
    expect(env.DB.calls).toHaveLength(1);
    const args = env.DB.calls[0].args;
    expect(args).toContain('wert:org-1'); // stripe_subscription_id
    expect(args).toContain('org-1'); // frisky_org_id
    expect(args).toContain('pro'); // plan
    expect(args).toContain('active'); // status
  });

  it('refuses a short payment (tampered click_id to a higher tier)', async () => {
    const env = grantEnv();
    const body = JSON.stringify({
      status: 'order_complete',
      order_id: 'w-hack',
      click_id: 'fenrir:operator:org-1:user-1', // claims operator ($15)
      currency_amount: 3, // but only paid the starter price
    });
    const res = await wertWebhook({ request: webhookRequest(body, await sign(SECRET, body)), env });
    const json = (await res.json()) as { granted: boolean; reason?: string };
    expect(json.granted).toBe(false);
    expect(json.reason).toBe('amount_mismatch');
    expect(env.DB.calls).toHaveLength(0);
  });
});
