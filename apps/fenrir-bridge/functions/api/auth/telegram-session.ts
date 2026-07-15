import { sessionSetCookie, signSession } from '../../_lib/auth';
import {
  dbNotConfiguredResponse,
  missingEnvResponse,
  type BillingEnv,
} from '../../_lib/billing-env';
import { effectiveOrgBillingPlan } from '../../_lib/billing-db';
import { ensureDefaultWorkspace } from '../../_lib/workspaces';
import { upsertProfileForSession } from '../../_lib/supabase-profiles';
import {
  createSessionFromTelegramLogin,
  type TelegramLoginPayload,
} from '../../_lib/telegram-login';

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  if (!context.env.DB) return dbNotConfiguredResponse();
  if (!telegramBotToken(context.env)) return missingEnvResponse('TELEGRAM_BOT_TOKEN');

  const body = await context.request.json<TelegramLoginPayload>().catch(() => null);
  if (!body) {
    return Response.json({ ok: false, error: 'invalid_telegram_login_payload' }, { status: 400 });
  }

  try {
    const session = await createSessionFromTelegramLogin(context.env.DB, context.env, body);
    if (context.env.DB) {
      await ensureDefaultWorkspace(context.env.DB, session);
    }
    await upsertProfileForSession(context.env, session, `telegram:${String(body.id)}`);
    const token = await signSession(session, context.env);
    return Response.json(
      {
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
          plan: await effectiveOrgBillingPlan(context.env, session.frisky_org_id),
        },
      },
      {
        headers: {
          'Set-Cookie': sessionSetCookie(token),
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'telegram_session_failed',
      },
      { status: 401 }
    );
  }
};

function telegramBotToken(env: BillingEnv) {
  return (
    env.TELEGRAM_BOT_TOKEN?.trim() ||
    env.TELEGRAM_PROD_BOT_TOKEN?.trim() ||
    env.TELEGRAM_DEV_BOT_TOKEN?.trim()
  );
}
