const encoder = new TextEncoder();
const decoder = new TextDecoder();
const lifetime = 5 * 60;
const glyphs = ["moon", "paw", "spark", "eye", "bolt", "diamond", "flame", "orbit", "wolf", "star"];
const allowedAudiences = new Set([
  // NOTE: "https://friskydev-human-verification.zainxantoine.workers.dev" was removed
  // 2026-08-17 — it is the workers.dev subdomain of the OTHER Cloudflare account, left
  // over from before the account move. The live verifier is on *.hrgrrtks2p.workers.dev,
  // so this entry granted nothing legitimate and widened the trust boundary for free.
  // Do NOT add *.hrgrrtks2p.workers.dev here: that account holds 71 unrelated Workers,
  // any of which could then mint verification grants. Serve staging from the already
  // allowed https://quality.communities.myfenrir.com instead.
  "https://quality.communities.myfenrir.com",
  "https://www.myfenrir.com",
  "https://authentik.friskydev.com",
  "https://authentik.tailab8146.ts.net:9443",
]);

// The gate embeds this verifier with `audience = window.location.origin`, and the
// same MyFenrir gate is legitimately served from several first-party origins:
// the apex (myfenrir.com), www, community subdomains, and the fenrir-bridge Pages
// project (its production alias plus per-deploy preview hostnames). Requiring an
// exact match against the static Set above rejected every origin except
// https://www.myfenrir.com, which failed challenge issuance for the native
// Frisky Runes and Signal Slider methods. Accept the explicit Set plus any HTTPS
// first-party MyFenrir or fenrir-bridge.pages.dev origin.
const isAllowedAudience = (audience) => {
  if (allowedAudiences.has(audience)) return true;
  try {
    const { protocol, hostname } = new URL(audience);
    if (protocol !== "https:") return false;
    if (hostname === "myfenrir.com" || hostname.endsWith(".myfenrir.com")) return true;
    if (hostname === "fenrir-bridge.pages.dev" || hostname.endsWith(".fenrir-bridge.pages.dev")) return true;
  } catch { /* not a valid absolute URL */ }
  return false;
};

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

function base64url(bytes) {
  const binary = typeof bytes === "string" ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode64(value) {
  return atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function key(secret, scope) {
  return crypto.subtle.importKey("raw", encoder.encode(`${scope}:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmac(value, secret, scope = "friskydev-human-v1") {
  return base64url(await crypto.subtle.sign("HMAC", await key(secret, scope), encoder.encode(value)));
}

async function token(payload, secret) {
  const body = base64url(String.fromCharCode(...encoder.encode(JSON.stringify(payload))));
  return `${body}.${await hmac(body, secret)}`;
}

async function readToken(value, secret, expectedKind) {
  try {
    const [body, signature] = String(value || "").split(".");
    if (!body || !signature || !equal(signature, await hmac(body, secret))) return null;
    const parsed = JSON.parse(decoder.decode(Uint8Array.from(decode64(body), (char) => char.charCodeAt(0))));
    return parsed.kind === expectedKind && parsed.expiresAt > Date.now() ? parsed : null;
  } catch { return null; }
}

function riskFor(request) {
  const score = request.cf?.botManagement?.score;
  if (typeof score === "number" && score < 20) return "high";
  if (typeof score === "number" && score < 50) return "medium";
  return request.headers.get("user-agent") ? "low" : "medium";
}

function randomInt(min, max) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return min + (values[0] % (max - min));
}

function verificationBinding(url) {
  const audience = url.searchParams.get("audience") || "";
  const context = url.searchParams.get("context") || "";
  if (!isAllowedAudience(audience) || !/^[A-Za-z0-9_-]{32,128}$/.test(context)) return null;
  return { audience, context };
}

async function issueGrant(method, secret, binding) {
  return token({
    kind: "verification-grant",
    method,
    audience: binding.audience,
    context: binding.context,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + lifetime * 1000,
  }, secret);
}

async function body(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json();
  return Object.fromEntries(new URLSearchParams(await request.text()));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.VERIFICATION_SECRET;

    if (url.pathname === "/health") {
      return json({ status: "ok", service: "friskydev-human-verification", secret: Boolean(secret) });
    }

    // Never let the assets single-page fallback turn a retired verification URL
    // into a successful HTML response.
    if (url.pathname.startsWith("/api/altcha/")) return json({ error: "not_found" }, 404);

    if (!secret && url.pathname.startsWith("/api/")) return json({ error: "verification_unavailable" }, 503);

    if (request.method === "POST" && url.pathname === "/api/grant/verify") {
      const input = await body(request);
      const grant = await readToken(input.grant, secret, "verification-grant");
      const verified = Boolean(grant
        && grant.audience === input.audience
        && grant.context === input.context
        && isAllowedAudience(grant.audience));
      return json({ verified, method: verified ? grant.method : undefined }, verified ? 200 : 400);
    }

    if (request.method === "GET" && url.pathname === "/api/puzzle") {
      const binding = verificationBinding(url);
      if (!binding) return json({ error: "invalid_verification_binding" }, 400);
      const risk = riskFor(request);
      const length = risk === "high" ? 3 : risk === "medium" ? 2 : 1;
      const target = [];
      while (target.length < length) {
        const candidate = glyphs[randomInt(0, glyphs.length)];
        if (!target.includes(candidate)) target.push(candidate);
      }
      const answer = target.join(":");
      const choices = new Set([answer]);
      if (length > 1) choices.add([...target].reverse().join(":"));
      while (choices.size < 4) {
        const variant = [...target];
        const position = randomInt(0, variant.length);
        let replacement = glyphs[randomInt(0, glyphs.length)];
        while (replacement === variant[position]) replacement = glyphs[randomInt(0, glyphs.length)];
        variant[position] = replacement;
        choices.add(variant.join(":"));
      }
      const options = [...choices].sort(() => Math.random() - 0.5);
      return json({ risk, sequence: target, options, token: await token({ kind: "puzzle", answer, risk, ...binding, expiresAt: Date.now() + lifetime * 1000 }, secret) });
    }

    if (request.method === "POST" && url.pathname === "/api/puzzle/verify") {
      const input = await body(request);
      const challenge = await readToken(input.token, secret, "puzzle");
      const verified = Boolean(challenge && String(input.answer || "") === challenge.answer);
      return json({ verified, method: "puzzle", grant: verified ? await issueGrant("puzzle", secret, challenge) : undefined }, verified ? 200 : 400);
    }

    if (request.method === "GET" && url.pathname === "/api/slider") {
      const binding = verificationBinding(url);
      if (!binding) return json({ error: "invalid_verification_binding" }, 400);
      const risk = riskFor(request);
      const tolerance = risk === "high" ? 2 : risk === "medium" ? 4 : 7;
      const target = randomInt(24, 77);
      return json({ risk, target, tolerance, token: await token({ kind: "slider", target, tolerance, risk, ...binding, expiresAt: Date.now() + lifetime * 1000 }, secret) });
    }

    if (request.method === "POST" && url.pathname === "/api/slider/verify") {
      const input = await body(request);
      const challenge = await readToken(input.token, secret, "slider");
      const position = Number(input.position);
      const verified = Boolean(challenge && Number.isFinite(position) && Math.abs(position - challenge.target) <= challenge.tolerance);
      return json({ verified, method: "slider", grant: verified ? await issueGrant("slider", secret, challenge) : undefined }, verified ? 200 : 400);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
