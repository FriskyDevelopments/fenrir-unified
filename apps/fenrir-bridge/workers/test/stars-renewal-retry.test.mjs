import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../fenrir-stars-payments.js';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE telegram_stars_orders (payload TEXT PRIMARY KEY, telegram_user_id TEXT, amount INTEGER, status TEXT);
    CREATE TABLE telegram_identity_links (telegram_user_id TEXT PRIMARY KEY, frisky_org_id TEXT, frisky_user_id TEXT);
    CREATE TABLE telegram_stars_entitlements (telegram_user_id TEXT PRIMARY KEY, telegram_chat_id TEXT, status TEXT, stars_amount INTEGER, currency TEXT, telegram_payment_charge_id TEXT, payload TEXT, created_at TEXT, updated_at TEXT, frisky_org_id TEXT, frisky_user_id TEXT, plan TEXT);
    CREATE TABLE billing_subscriptions (stripe_subscription_id TEXT PRIMARY KEY, frisky_org_id TEXT, stripe_customer_id TEXT, plan TEXT, status TEXT, current_period_end TEXT, cancel_at_period_end INTEGER, created_at TEXT, updated_at TEXT);
    INSERT INTO telegram_stars_orders VALUES ('fenrir_stars:42:abc','42',1150,'paid');
    INSERT INTO telegram_identity_links VALUES ('42','org','user');`);
  let failBatch = false;
  const db = {
    prepare(query) { return { bind(...params) { return {
      async first() { return sql.prepare(query).get(...params) ?? null; },
      async run() { sql.prepare(query).run(...params); return { success: true }; },
      query, params
    }; } }; },
    async batch(stmts) {
      if (failBatch) { failBatch = false; throw new Error('simulated transient D1 failure'); }
      sql.exec('BEGIN');
      try { for (const s of stmts) sql.prepare(s.query).run(...s.params); sql.exec('COMMIT'); }
      catch(e) { sql.exec('ROLLBACK'); throw e; }
    }
  };
  return { sql, db, failNextBatch() { failBatch = true; } };
}
function update(charge, date, expiration) {
  const payment = { invoice_payload:'fenrir_stars:42:abc', currency:'XTR', total_amount:1150,
    is_recurring:true, telegram_payment_charge_id:charge };
  if (expiration !== undefined) payment.subscription_expiration_date = expiration;
  return { message:{ date, chat:{id:42}, from:{id:42}, successful_payment:payment } };
}
async function deliver(f, data, secret = 'secret') {
  const request = new Request('https://example.test/api/telegram/webhook', { method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret}, body:JSON.stringify(data) });
  return worker.fetch(request, { DB:f.db, TELEGRAM_PROD_BOT_TOKEN:'test', TELEGRAM_WEBHOOK_SECRET:'secret' });
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ok:true}), {status:200});
const now = Math.floor(Date.now()/1000) - 60;
const end = (f) => f.sql.prepare('SELECT current_period_end FROM billing_subscriptions').get()?.current_period_end;

test('failed membership write is retried on duplicate renewal', async () => {
  const f=fixture(), msg=update('charge-1',now,now+30*86400);
  f.failNextBatch();
  assert.equal((await deliver(f,msg)).status,500);
  assert.equal(end(f),undefined);
  assert.equal(f.sql.prepare('SELECT telegram_payment_charge_id AS charge FROM telegram_stars_entitlements').get().charge,'charge-1');
  assert.equal((await deliver(f,msg)).status,200);
  assert.equal(end(f),new Date((now+30*86400)*1000).toISOString());
  assert.equal((await deliver(f,msg)).status,200);
  assert.equal(end(f),new Date((now+30*86400)*1000).toISOString());
});

test('older delivery and duplicate do not shorten access', async () => {
  const f=fixture();
  const older=update('old',now-25*86400,now+5*86400);
  const newer=update('new',now,now+30*86400);
  assert.equal((await deliver(f,newer)).status,200);
  assert.equal((await deliver(f,older)).status,200);
  assert.equal((await deliver(f,newer)).status,200);
  assert.equal(end(f),new Date((now+30*86400)*1000).toISOString());
});

test('missing expiration uses stable message date on redelivery', async () => {
  const f=fixture(), msg=update('fallback',now-86400);
  assert.equal((await deliver(f,msg)).status,200);
  const expected=new Date((now-86400+30*86400)*1000).toISOString();
  assert.equal(end(f),expected);
  assert.equal((await deliver(f,msg)).status,200);
  assert.equal(end(f),expected);
});

test('invalid secret does not process a payment', async () => {
  const f=fixture();
  assert.equal((await deliver(f,update('bad',now,now+30*86400),'wrong')).status,200);
  assert.equal(end(f),undefined);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_stars_entitlements').get().n,0);
});
