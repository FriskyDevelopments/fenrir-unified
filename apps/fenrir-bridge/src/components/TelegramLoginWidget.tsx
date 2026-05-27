import { useEffect, useMemo, useRef, useState } from "react";
import { authService, type TelegramLoginPayload } from "../services/api";

type TelegramLoginWidgetProps = {
  botUsername: string;
  onSuccess?: () => void;
};

export function TelegramLoginWidget({ botUsername, onSuccess }: TelegramLoginWidgetProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loginCallbackName = useMemo(() => `fenrirTelegramAuth_${Math.random().toString(36).slice(2, 11)}`, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !botUsername) return;

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
    script.setAttribute("data-telegram-login", botUsername.replace(/^@/, ""));
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
  }, [botUsername, loginCallbackName, onSuccess]);

  if (!botUsername) {
    return (
      <div className="telegram-login-widget telegram-login-widget-missing">
        <p>Telegram login is not configured yet.</p>
      </div>
    );
  }

  return (
    <div className="telegram-login-widget">
      <div className="telegram-login-widget-host" ref={hostRef} />
      <small className="muted">Telegram proves the admin account and opens the same Fenrir session.</small>
      {status ? <small className="telegram-login-error">{status}</small> : null}
    </div>
  );
}
