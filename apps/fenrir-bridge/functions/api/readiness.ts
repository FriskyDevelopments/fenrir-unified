import { readSession } from '../_lib/auth';
import type { BillingEnv } from '../_lib/billing-env';
import { computeReadiness } from '../_lib/readiness';
import { noStoreJson } from '../_lib/responses';

export async function onRequestGet(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  }
  return noStoreJson(computeReadiness(context.env));
}
