import { readSession } from "../../_lib/auth";
import { missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";

type TelegramApiResult<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string };

type TelegramChat = {
  photo?: {
    small_file_id?: string;
    big_file_id?: string;
  };
};

type TelegramFile = {
  file_path?: string;
};

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return Response.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  const url = new URL(context.request.url);
  const chatId = url.searchParams.get("chat_id")?.trim();
  if (!chatId) return fallbackAvatar("missing_chat_id");

  const token = context.env.TELEGRAM_PROD_BOT_TOKEN?.trim() || context.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return missingEnvResponse("TELEGRAM_BOT_TOKEN");

  try {
    const chat = await telegramApi<TelegramChat>(token, "getChat", { chat_id: chatId });
    const fileId = chat.photo?.big_file_id || chat.photo?.small_file_id;
    if (!fileId) return fallbackAvatar("no_group_photo");

    const file = await telegramApi<TelegramFile>(token, "getFile", { file_id: fileId });
    if (!file.file_path) return fallbackAvatar("no_file_path");

    const photoResponse = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!photoResponse.ok) return fallbackAvatar("telegram_file_error");

    const headers = new Headers({
      "Content-Type": photoResponse.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "private, max-age=300"
    });
    return new Response(await photoResponse.arrayBuffer(), { headers });
  } catch {
    return fallbackAvatar("telegram_lookup_failed");
  }
};

async function telegramApi<T>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json<TelegramApiResult<T>>().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(body?.description || `telegram_${method}_failed`);
  }
  return body.result;
}

function fallbackAvatar(reason: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${reason}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0f9f87"/>
      <stop offset="0.52" stop-color="#121715"/>
      <stop offset="1" stop-color="#ff1744"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#g)"/>
  <text x="50%" y="57%" text-anchor="middle" font-size="96" font-family="Arial, sans-serif">🐾</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=60"
    }
  });
}
