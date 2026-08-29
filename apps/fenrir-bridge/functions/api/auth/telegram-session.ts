import { sessionSetCookie, signSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { effectiveOrgBillingPlan } from "../../_lib/billing-db";
import { ensureDefaultWorkspace } from "../../_lib/workspaces";
import { upsertProfileForSession } from "../../_lib/supabase-profiles";
import {
  createSessionFromTelegramLogin,
  TelegramAuthError,
  TelegramConfigError,
  TelegramPayloadError,
  type TelegramLoginPayload
} from "../../_lib/telegram-login";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  if (!context.env.DB) return dbNotConfiguredResponse();
  if (!telegramBotToken(context.env)) return missingEnvResponse("TELEGRAM_BOT_TOKEN");

  const body = await context.request.json<TelegramLoginPayload>().catch(() => null);
  if (!body) {
    return Response.json(
      {
        ok: false,
        error: "invalid_telegram_login_payload",
        message: "We could not read the sign-in data Telegram sent. Please try again."
      },
      { status: 400 }
    );
  }

  try {
    const verified = await createSessionFromTelegramLogin(context.env.DB, context.env, body);
    let session = verified.session;
    if (context.env.DB) {
      session = await ensureDefaultWorkspace(context.env.DB, session);
    }
    await upsertProfileForSession(context.env, session, `telegram:${verified.telegramUserId}`);
    const token = await signSession(session, context.env);
    return Response.json(
      {
        ok: true,
        authenticated: true,
        user: {
          id: session.frisky_user_id,
          email: session.email,
          name: session.name,
          authProvider: session.provider
        },
        org: {
          id: session.frisky_org_id,
          plan: await effectiveOrgBillingPlan(context.env, session.frisky_org_id)
        }
      },
      {
        headers: {
          "Set-Cookie": sessionSetCookie(token)
        }
      }
    );
  } catch (error) {
    // Three different states, three different answers. Conflating them is how
    // "we could not verify" ended up being shown to users as "your payload is
    // invalid", which blames them for our misconfiguration.
    if (error instanceof TelegramConfigError) {
      return Response.json(
        {
          ok: false,
          error: "verification_unavailable",
          reason: error.message,
          message: "Telegram sign-in is temporarily unavailable. Please try again shortly."
        },
        { status: 503 }
      );
    }
    if (error instanceof TelegramPayloadError) {
      return Response.json(
        {
          ok: false,
          error: "invalid_telegram_login_payload",
          reason: error.message,
          message: "We could not read the sign-in data Telegram sent. Please try again."
        },
        { status: 400 }
      );
    }
    if (error instanceof TelegramAuthError) {
      return Response.json(
        {
          ok: false,
          error: "telegram_login_rejected",
          reason: error.message,
          message: "That Telegram sign-in could not be confirmed. Please open the app again from the bot."
        },
        { status: 401 }
      );
    }
    return Response.json(
      {
        ok: false,
        error: "telegram_session_failed",
        message: "Something went wrong on our side. Please try again."
      },
      { status: 500 }
    );
  }
};

function telegramBotToken(env: BillingEnv) {
  return env.TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_PROD_BOT_TOKEN?.trim() || env.TELEGRAM_DEV_BOT_TOKEN?.trim();
}
