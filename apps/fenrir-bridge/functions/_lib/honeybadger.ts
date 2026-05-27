type HoneybadgerEnv = {
  HONEYBADGER_API_KEY?: string;
  HONEYBADGER_ENVIRONMENT?: string;
  HONEYBADGER_REVISION?: string;
};

type HoneybadgerNoticeInput = {
  request?: Request;
  error: unknown;
  component: string;
  action: string;
  context?: Record<string, unknown>;
  tags?: string[];
};

const noticeEndpoint = "https://api.honeybadger.io/v1/notices";
const notifier = {
  name: "Fenrir Bridge Honeybadger Edge Reporter",
  url: "https://www.myfenrir.com",
  version: "1.0.0"
};

export async function notifyHoneybadger(env: HoneybadgerEnv, input: HoneybadgerNoticeInput) {
  const apiKey = env.HONEYBADGER_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, skipped: "missing_honeybadger_api_key" };

  const error = normalizeError(input.error);
  const url = input.request ? new URL(input.request.url) : null;
  const payload = {
    notifier,
    error: {
      class: error.name,
      message: error.message,
      tags: input.tags ?? [],
      backtrace: parseBacktrace(error.stack)
    },
    request: {
      component: input.component,
      action: input.action,
      url: url ? `${url.origin}${url.pathname}` : undefined,
      params: url ? Object.fromEntries(url.searchParams.entries()) : undefined,
      context: sanitizeContext(input.context ?? {}),
      cgi_data: input.request ? {
        REQUEST_METHOD: input.request.method,
        PATH_INFO: url?.pathname,
        HTTP_HOST: url?.host,
        HTTP_USER_AGENT: input.request.headers.get("user-agent") ?? undefined,
        CF_RAY: input.request.headers.get("cf-ray") ?? undefined,
        CF_CONNECTING_IP: input.request.headers.get("cf-connecting-ip") ?? undefined
      } : undefined
    },
    server: {
      environment_name: env.HONEYBADGER_ENVIRONMENT ?? "production",
      revision: env.HONEYBADGER_REVISION,
      hostname: "cloudflare-pages"
    }
  };

  const response = await fetch(noticeEndpoint, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "FenrirHoneybadgerEdge 1.0; Cloudflare Pages Functions"
    },
    body: JSON.stringify(payload)
  });

  return { ok: response.ok, status: response.status };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack || ""
    };
  }
  if (typeof error === "string") {
    return { name: "Error", message: error, stack: "" };
  }
  return { name: "Error", message: "Unknown error", stack: "" };
}

function parseBacktrace(stack: string) {
  return stack
    .split("\n")
    .slice(1, 32)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (!match) return { file: line, number: "0", method: "unknown" };
      return {
        method: match[1] || "anonymous",
        file: match[2],
        number: match[3]
      };
    });
}

function sanitizeContext(context: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (/token|secret|password|cookie|authorization/i.test(key)) continue;
    safe[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  return safe;
}
