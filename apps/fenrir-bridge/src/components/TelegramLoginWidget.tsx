import { useEffect, useMemo, useRef, useState } from "react";
import { authService, type TelegramLoginPayload } from "../services/api";

type TelegramLoginWidgetProps = {
  botUsername: string;
  onSuccess?: () => void;
};

function normalizeBotUsername(value: string): string {
  return value.trim().replace(/^@/, "");
}

export function TelegramLoginWidget({ botUsername, onSuccess }: TelegramLoginWidgetProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const normalized = useMemo(() => normalizeBotUsername(botUsername || ""), [botUsername]);

  const loginCallbackName = useMemo(
    () => `fenrirTelegramAuth_${Math.random().toString(36).slice(2, 11)}`,
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !normalized) return;

    const globalWindow = window as unknown as Window & Record<string, (payload: TelegramLoginPayload) => void>;
    globalWindow[loginCallbackName] = async (payload: TelegramLoginPayload) => {
      try {
        setStatus(null);
        await authService.telegramLogin(payload);
        onSuccess?.();
        window.location.assign("/main");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "telegram_login_failed");
      }
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", normalized);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", `${loginCallbackName}(user)`);
    script.setAttribute("data-radius", "12");
    host.replaceChildren(script);

    return () => {
      delete globalWindow[loginCallbackName];
      host.replaceChildren();
    };
  }, [normalized, loginCallbackName, onSuccess]);

  if (!normalized) {
    return (
      <div className="telegram-login-widget telegram-login-widget-missing" role="status">
        <p className="label">Telegram login not configured</p>
        <p className="muted">
          Set <code>FENRIR_TELEGRAM_BOT_USERNAME</code> (Pages) and{" "}
          <code>TELEGRAM_BOT_TOKEN</code> + <code>TELEGRAM_WEBHOOK_SECRET</code> (Workers)
          so the Login Widget and Stars checkout share one Fenrir bot.
        </p>
        <ul className="telegram-setup-checklist">
          <li>Create / reclaim the Fenrir bot with BotFather</li>
          <li>Enable the Telegram Login Widget domain for myfenrir.com</li>
          <li>Point the webhook at <code>/api/telegram/webhook</code></li>
          <li>Re-run <code>npm run verify:readiness</code> until Stars + webhook are green</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="telegram-login-widget">
      <div className="telegram-login-widget-host" ref={hostRef} />
      <small className="muted">
        Telegram proves the admin account via @{normalized} and opens the same Fenrir session.
      </small>
      {status ? <small className="telegram-login-error">{status}</small> : null}
    </div>
  );
}
