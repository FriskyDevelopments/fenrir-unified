import { noStoreJson } from '../../_lib/responses';

type WaitlistRequest = {
  name?: unknown;
  email?: unknown;
  interest?: unknown;
  telegramHandle?: unknown;
  message?: unknown;
  source?: unknown;
  pagePath?: unknown;
  referrer?: unknown;
};

function cleanText(value: unknown, max = 400) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export async function onRequestPost(context: any) {
  const db = context.env?.DB;
  if (!db) {
    return noStoreJson({ ok: false, error: 'd1_not_configured' }, { status: 503 });
  }

  const body = (await context.request.json().catch(() => null)) as WaitlistRequest | null;
  const name = cleanText(body?.name, 120);
  const email = cleanText(body?.email, 180).toLowerCase();
  const interest = cleanText(body?.interest, 120);
  const telegramHandle = cleanText(body?.telegramHandle, 80);
  const message = cleanText(body?.message, 2000);
  const source = cleanText(body?.source, 80) || 'waitlist-page';
  const pagePath = cleanText(body?.pagePath, 120);
  const referrer = cleanText(body?.referrer, 180);

  if (!name) {
    return noStoreJson({ ok: false, error: 'invalid_name' }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return noStoreJson({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  if (!interest) {
    return noStoreJson({ ok: false, error: 'invalid_interest' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `frisky_wait_${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

  await db
    .prepare(
      `INSERT INTO frisky_waitlist_entries (
        id, email, name, interest, telegram_handle, message, source, page_path, referrer, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         interest = excluded.interest,
         telegram_handle = excluded.telegram_handle,
         message = excluded.message,
         source = excluded.source,
         page_path = excluded.page_path,
         referrer = excluded.referrer,
         status = 'pending',
         updated_at = excluded.updated_at`
    )
    .bind(id, email, name, interest, telegramHandle, message, source, pagePath, referrer, now, now)
    .run();

  return noStoreJson({
    ok: true,
    status: 'pending',
    message: 'Waitlist request saved.',
  });
}
