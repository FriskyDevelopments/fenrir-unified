const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "fenrir-bridge-mcp-beta";
const SERVER_TITLE = "Fenrir Bridge MCP Beta";
const SERVER_VERSION = "0.1.0-beta";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.myfenrir.com",
  "https://auth.myfenrir.com",
  "http://localhost:5173",
  "http://localhost:5177",
  "http://localhost:6274",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5177",
  "http://127.0.0.1:6274"
];

const KNOWN_JSON_ROUTES = new Set([
  "/api/health",
  "/api/auth/me",
  "/api/app-state",
  "/api/billing/status",
  "/api/readiness",
  "/api/telegram/link",
  "/api/public/bridge/client-launch",
  "/api/public/room/client-briefing",
  "/api/routes/audit"
]);

const tools = [
  {
    name: "fenrir.health",
    title: "Fenrir beta health",
    description: "Return the beta MCP/API server health payload and binding visibility without exposing secrets.",
    inputSchema: {
      type: "object",
      properties: {}
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "fenrir.route_audit",
    title: "Fenrir route audit",
    description: "Classify a route as API, MCP, or SPA and state the expected production handler.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Route path to audit, for example /api/app-state or /main."
        }
      },
      required: ["path"]
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "fenrir.readiness_snapshot",
    title: "Fenrir readiness snapshot",
    description: "Return beta readiness signals for API routing, D1 binding, auth config, and payment config.",
    inputSchema: {
      type: "object",
      properties: {}
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "fenrir.beta_plan",
    title: "Fenrir divide and conquer beta plan",
    description: "Return the staged beta plan for MCP/API routing before full production launch.",
    inputSchema: {
      type: "object",
      properties: {}
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];

const resources = [
  {
    uri: "fenrir://beta/plan",
    name: "beta-plan",
    title: "Fenrir beta divide and conquer plan",
    description: "Staged beta path for MCP/API routing.",
    mimeType: "application/json"
  },
  {
    uri: "fenrir://routes/api-contract",
    name: "api-route-contract",
    title: "Fenrir API route contract",
    description: "Contract that prevents /api/* from falling through to the SPA shell.",
    mimeType: "application/json"
  },
  {
    uri: "fenrir://status/health",
    name: "health",
    title: "Fenrir beta health",
    description: "Current beta server health payload.",
    mimeType: "application/json"
  }
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return emptyResponse(204, request, env);

    const url = new URL(request.url);

    // OAuth discovery endpoints — no auth, no origin check required
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      return oauthProtectedResourceMetadata(request, env, url);
    }
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
      return oauthAuthorizationServerMetadata(request, env, url);
    }

    if (!isAllowedOrigin(request, env)) {
      return json({ ok: false, error: "origin_not_allowed" }, { status: 403 }, request, env);
    }

    const authFailure = await mcpAuthFailure(request, env, url);
    if (authFailure) return authFailure;
    if (isMcpEndpoint(url.pathname)) return handleMcp(request, env, url);
    if (request.method === "GET") return handleRestGet(request, env, url);
    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "method_not_allowed" }, { status: 405 }, request, env);
    }
    return json({ ok: true, service: SERVER_NAME, mcp: "/mcp", health: "/api/health" }, {}, request, env);
  }
};

async function handleMcp(request, env, url) {
  if (request.method === "GET") {
    if ((request.headers.get("accept") || "").includes("text/event-stream")) {
      return json({ ok: false, error: "sse_not_enabled", endpoint: url.pathname }, { status: 405 }, request, env);
    }
    return json({ ok: true, service: SERVER_NAME, endpoint: url.pathname, transport: "streamable-http" }, {}, request, env);
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, { status: 405 }, request, env);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), { status: 400 }, request, env);
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const message of messages) {
    const response = await handleRpcMessage(message, env, url);
    if (response) responses.push(response);
  }

  if (!responses.length) return emptyResponse(202, request, env);
  return json(Array.isArray(payload) ? responses : responses[0], {}, request, env);
}

function handleRestGet(request, env, url) {
  if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/health") {
    return json(healthPayload(env, url), {}, request, env);
  }
  if (url.pathname === "/api/auth/me") {
    return json({
      ok: true,
      authenticated: false,
      product: "fenrir-bridge",
      source: SERVER_NAME
    }, {}, request, env);
  }
  if (url.pathname === "/api/readiness") {
    return json(readinessPayload(env), {}, request, env);
  }
  if (url.pathname === "/api/routes/audit") {
    return json(routeAuditPayload(url.searchParams.get("path") || "/api/health"), {}, request, env);
  }
  if (url.pathname === "/api/app-state" || url.pathname === "/api/billing/status" || url.pathname === "/api/telegram/link") {
    return json({ ok: false, error: "authentication_required", source: SERVER_NAME }, { status: 401 }, request, env);
  }
  if (url.pathname.startsWith("/api/public/bridge/") || url.pathname.startsWith("/api/public/room/")) {
    return json({ ok: false, error: "public_route_not_configured", source: SERVER_NAME }, { status: 404 }, request, env);
  }
  if (url.pathname.startsWith("/api/")) {
    return json({ ok: false, error: "api_route_not_found", path: url.pathname, source: SERVER_NAME }, { status: 404 }, request, env);
  }
  return json({ ok: true, service: SERVER_NAME, mcp: "/mcp", health: "/api/health" }, {}, request, env);
}

async function handleRpcMessage(message, env, url) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message?.id ?? null, -32600, "Invalid Request");
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const id = hasId ? message.id : null;

  try {
    switch (message.method) {
      case "initialize":
        return rpcResult(id, initializeResult(message.params));
      case "notifications/initialized":
        return null;
      case "ping":
        return hasId ? rpcResult(id, {}) : null;
      case "tools/list":
        return rpcResult(id, { tools });
      case "tools/call":
        return rpcResult(id, await callTool(message.params, env, url));
      case "resources/list":
        return rpcResult(id, { resources });
      case "resources/read":
        return rpcResult(id, readResource(message.params, env, url));
      default:
        return rpcError(id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    return rpcError(id, -32603, error instanceof Error ? error.message : "Internal error");
  }
}

function initializeResult(params = {}) {
  const requestedVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : MCP_PROTOCOL_VERSION;
  return {
    protocolVersion: requestedVersion === MCP_PROTOCOL_VERSION ? requestedVersion : MCP_PROTOCOL_VERSION,
    capabilities: {
      logging: {},
      resources: {
        subscribe: false,
        listChanged: false
      },
      tools: {
        listChanged: false
      }
    },
    serverInfo: {
      name: SERVER_NAME,
      title: SERVER_TITLE,
      version: SERVER_VERSION
    },
    instructions: "Fenrir Bridge beta MCP server. Use read-only tools first. API routing remains isolated from the React SPA."
  };
}

async function callTool(params = {}, env, url) {
  const name = params.name;
  const args = params.arguments || {};
  if (!tools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);

  if (name === "fenrir.health") return toolResult(healthPayload(env, url));
  if (name === "fenrir.route_audit") return toolResult(routeAuditPayload(args.path || "/api/health"));
  if (name === "fenrir.readiness_snapshot") return toolResult(readinessPayload(env));
  if (name === "fenrir.beta_plan") return toolResult(betaPlanPayload());
  throw new Error(`Unhandled tool: ${name}`);
}

function readResource(params = {}, env, url) {
  const uri = params.uri;
  if (!resources.some((resource) => resource.uri === uri)) throw new Error(`Unknown resource: ${uri}`);

  let payload;
  if (uri === "fenrir://beta/plan") payload = betaPlanPayload();
  if (uri === "fenrir://routes/api-contract") payload = apiRouteContractPayload();
  if (uri === "fenrir://status/health") payload = healthPayload(env, url);

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function healthPayload(env, url) {
  return {
    ok: true,
    service: SERVER_NAME,
    title: SERVER_TITLE,
    version: SERVER_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: "streamable-http",
    mcpEndpoint: "/mcp",
    apiHealth: "/api/health",
    hostname: url.hostname,
    bindings: {
      d1: Boolean(env.DB)
    },
    routeContract: {
      apiReturnsJson: true,
      unknownApiReturnsJson404: true,
      spaFallbackOwnsApi: false
    }
  };
}

function readinessPayload(env) {
  const mcpAuthToken = configuredMcpAuthToken(env);
  return {
    ok: true,
    service: SERVER_NAME,
    apiRouting: {
      knownApiJson: true,
      unknownApiJson404: true,
      spaFallbackBlockedForApi: true
    },
    bindings: {
      d1Configured: Boolean(env.DB),
      mcpAuthConfigured: Boolean(mcpAuthToken),
      supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
      supabaseServiceRoleConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
      telegramConfigured: Boolean(env.TELEGRAM_PROD_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN)
    },
    betaGate: {
      readOnlyTools: true,
      writeToolsEnabled: false,
      oauthRequiredForWrites: true
    }
  };
}

function routeAuditPayload(pathValue) {
  const path = normalizePath(pathValue);
  const isMcp = path === "/mcp" || path === "/api/mcp";
  const isApi = path.startsWith("/api/");
  const known = KNOWN_JSON_ROUTES.has(path) || path.startsWith("/api/public/bridge/") || path.startsWith("/api/public/room/");

  return {
    ok: true,
    path,
    class: isMcp ? "mcp" : isApi ? "api" : "spa",
    expectedHandler: isMcp || isApi ? SERVER_NAME : "fenrir-bridge-pages",
    expectedContentType: isMcp || isApi ? "application/json" : "text/html",
    expectedStatus: isMcp ? 200 : isApi ? (known ? "200/401/404 JSON" : 404) : 200,
    spaFallbackAllowed: !isApi && !isMcp,
    notes: isApi && !known ? "Unknown API routes must return JSON 404, not index.html." : "Route is covered by the beta contract."
  };
}

function betaPlanPayload() {
  return {
    ok: true,
    strategy: "divide-and-conquer",
    phases: [
      {
        id: "mcp-beta",
        status: "current",
        goal: "Ship read-only MCP/API beta server with JSON health, route audit, readiness, tools, and resources."
      },
      {
        id: "api-routing",
        status: "next",
        goal: "Route live /api/* to the Worker/MCP layer so no API path returns the SPA HTML shell."
      },
      {
        id: "auth-data",
        status: "after-routing",
        goal: "Move authenticated app-state, billing, Telegram, and readiness handlers behind the server layer."
      },
      {
        id: "production-go-no-go",
        status: "final",
        goal: "Retest custom domain, preview domain, JSON APIs, auth callback, and SPA fallback."
      }
    ],
    acceptance: apiRouteContractPayload().acceptance
  };
}

function apiRouteContractPayload() {
  return {
    ok: true,
    contract: "Fenrir API routes never fall through to the React SPA.",
    acceptance: [
      "GET /api/health returns JSON, not index.html.",
      "Known /api/* endpoints return JSON with the correct HTTP status.",
      "Unknown /api/* returns JSON 404.",
      "Content-Type is application/json.",
      "SPA fallback still works for non-API client routes.",
      "Custom domain and preview domain behave the same."
    ]
  };
}

function toolResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload,
    isError: false
  };
}

function oauthProtectedResourceMetadata(request, env, url) {
  const base = `${url.protocol}//${url.host}`;
  const body = {
    resource: `${base}/mcp`,
    authorization_servers: [`${supabaseAuthIssuer(env)}`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email"]
  };
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=3600",
    "access-control-allow-origin": "*"
  });
  return new Response(JSON.stringify(body, null, 2), { status: 200, headers });
}

function oauthAuthorizationServerMetadata(request, env, url) {
  const issuer = supabaseAuthIssuer(env);
  const body = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["none"]
  };
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=3600",
    "access-control-allow-origin": "*"
  });
  return new Response(JSON.stringify(body, null, 2), { status: 200, headers });
}

function isMcpEndpoint(pathname) {
  return pathname === "/mcp" || pathname === "/api/mcp";
}

function normalizePath(pathValue) {
  const value = String(pathValue || "/").trim();
  if (!value) return "/";
  try {
    return new URL(value, "https://fenrir.local").pathname;
  } catch {
    return value.startsWith("/") ? value : `/${value}`;
  }
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  };
}

function json(body, init = {}, request, env) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  applyCors(headers, request, env);
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

function emptyResponse(status, request, env) {
  const headers = new Headers();
  applyCors(headers, request, env);
  return new Response(null, { status, headers });
}

function applyCors(headers, request, env) {
  const origin = request?.headers?.get("Origin");
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, mcp-protocol-version, mcp-session-id");
  headers.set("access-control-max-age", "86400");
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const allowed = allowedOrigins(env);
  return allowed.has("*") || allowed.has(origin);
}

async function mcpAuthFailure(request, env, url) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const received = match?.[1]?.trim() || "";

  // 1. Static token (bot/legacy — backward compat)
  const staticToken = configuredMcpAuthToken(env);
  if (staticToken) {
    if (received && timingSafeEqual(received, staticToken)) return null;
  }

  // 2. Supabase Auth JWT — validate against the canonical project's JWKS
  if (received) {
    const claims = await validateSupabaseJwt(received, env);
    if (claims) return null;
  }

  // Not valid — direct the client to the Supabase authorization server.
  const resourceMetaUrl = `${url.protocol}//${url.host}/.well-known/oauth-protected-resource`;

  // If nothing is configured at all, return 503
  if (!staticToken && !supabaseAuthIssuer(env)) {
    return json(
      {
        ok: false,
        error: "mcp_auth_not_configured",
        detail: "Set FRISKY_BOT_API_TOKEN (static) or SUPABASE_URL before exposing Fenrir MCP beta."
      },
      { status: 503 },
      request,
      env
    );
  }

  const init = { status: 401 };
  const body = { ok: false, error: "mcp_auth_required" };
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  applyCors(headers, request, env);
  if (resourceMetaUrl) {
    headers.set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetaUrl}"`);
  }
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

// Supabase Auth on the canonical MyFenrir project is the ONLY authorization
// server. No external auth broker may be wired here (banned, like Vercel).
function supabaseAuthIssuer(env) {
  const base = String(env.SUPABASE_URL || "https://yqevglppbhuoxxfsfnih.supabase.co").replace(/\/$/, "");
  return `${base}/auth/v1`;
}

async function validateSupabaseJwt(token, env) {
  const issuer = supabaseAuthIssuer(env);

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  } catch {
    return null;
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.iss !== issuer) return null;

  try {
    const jwksUrl = `${issuer}/.well-known/jwks.json`;
    const jwks = await fetch(jwksUrl, { cf: { cacheTtl: 3600 } }).then((r) => r.json());
    const jwk = jwks.keys?.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const algorithm = jwk.kty === "EC"
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const verifyAlgorithm = jwk.kty === "EC"
      ? { name: "ECDSA", hash: "SHA-256" }
      : "RSASSA-PKCS1-v1_5";
    const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);
    const signedData = `${parts[0]}.${parts[1]}`;
    const signature = base64UrlToBytes(parts[2]);
    const valid = await crypto.subtle.verify(
      verifyAlgorithm, key,
      signature, new TextEncoder().encode(signedData)
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

function configuredMcpAuthToken(env) {
  return String(env.FRISKY_BOT_API_TOKEN || env.MCP_BETA_TOKEN || "").trim();
}

function allowedOrigins(env) {
  const configured = String(env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
