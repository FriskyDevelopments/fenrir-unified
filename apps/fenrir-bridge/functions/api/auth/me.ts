import { readSession } from '../../_lib/auth';
import { effectiveOrgBillingPlan } from '../../_lib/billing-db';
import { noStoreJson } from '../../_lib/responses';

export async function onRequestGet(context: any) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: true, authenticated: false });
  }
  const plan = await effectiveOrgBillingPlan(context.env, session.frisky_org_id);
  return noStoreJson({
    ok: true,
    authenticated: true,
    user: {
      id: session.frisky_user_id,
      email: session.email,
      name: session.name,
      authProvider: session.provider,
    },
    org: {
      id: session.frisky_org_id,
      plan,
    },
  });
}
