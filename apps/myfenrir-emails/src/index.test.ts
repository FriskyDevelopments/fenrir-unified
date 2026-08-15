import assert from "node:assert/strict";
import test from "node:test";
import worker, { type Env } from "./index";

function request(path: string, init?: RequestInit, env: Env = {}) {
  return worker.fetch(new Request(`https://emails.myfenrir.com${path}`, init), env);
}

test("health exposes the renderer inventory and binding state", async () => {
  const response = await request("/health", undefined, { EMAIL: { send: async () => ({ messageId: "test" }) } });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.status, "ok");
  assert.equal(body.emailBinding, true);
  assert.equal(body.templates.length, 8);
  assert.ok(body.templates.includes("acceso"));
  assert.ok(body.templates.includes("bienvenida"));
  assert.deepEqual(body.locales, ["en", "es", "fr", "de"]);
  assert.equal(body.defaultLocale, "en");
});

test("preview defaults to English and supports Spanish, French and German", async () => {
  const response = await request("/preview/bienvenida?brand=myfenrir");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /MYFENRIR/);
  assert.match(html, /Welcome to the pack, Francisco/);
  assert.match(html, /fenrir-splash-icon-512\.png/);
  for (const [locale, phrase] of [["es", "Bienvenido, Francisco"], ["fr", "Bienvenue dans la meute, Francisco"], ["de", "Willkommen im Rudel, Francisco"]]) {
    const localized = await (await request(`/preview/bienvenida?locale=${locale}`)).text();
    assert.match(localized, new RegExp(phrase));
    assert.match(localized, new RegExp(`lang="${locale}"`));
  }
});

test("send rejects missing and incorrect bearer credentials", async () => {
  const env: Env = { REQUIRE_AUTH: "1", SEND_AUTH_TOKEN: "correct-token" };
  for (const authorization of [undefined, "Bearer wrong-token"]) {
    const response = await request("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { authorization } : {}) },
      body: JSON.stringify({ template: "acceso", to: "qa@example.com" }),
    }, env);
    assert.equal(response.status, 401);
  }
});

test("send renders and dispatches through the Cloudflare binding", async () => {
  let delivered: Record<string, unknown> | undefined;
  const env: Env = {
    REQUIRE_AUTH: "1",
    SEND_AUTH_TOKEN: "correct-token",
    EMAIL_PROVIDER: "cloudflare",
    EMAIL: { send: async (message) => { delivered = message; return { messageId: "cf-test-id" }; } },
  };
  const response = await request("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({
      template: "acceso",
      to: "qa@example.com",
      data: { nombre: "QA", url: "https://myfenrir.com/main?test=1", minutos: 15 },
    }),
  }, env);
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.provider, "cloudflare");
  assert.equal(body.id, "cf-test-id");
  assert.equal((delivered as any)?.to[0], "qa@example.com");
  assert.match(String((delivered as any)?.html), /Sign in to MyFenrir/);
  assert.match(String((delivered as any)?.text), /https:\/\/myfenrir\.com\/main\?test=1/);
});

test("send accepts Telegram language_code and returns the resolved locale", async () => {
  let delivered: any;
  const response = await request("/send", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ template:"acceso", to:"qa@example.com", telegramLanguageCode:"fr-FR", data:{url:"https://myfenrir.com"} }) }, { EMAIL:{send:async(message)=>{delivered=message;return {messageId:"fr-id"};}} });
  const body = await response.json() as any;
  assert.equal(body.locale, "fr");
  assert.match(delivered.html, /Se connecter à MyFenrir/);
});

test("all eight templates render in every supported locale", async () => {
  const health = await (await request("/health")).json() as any;
  for (const template of health.templates) for (const locale of health.locales) {
    const response = await request(`/preview/${template}?locale=${locale}`);
    const markup = await response.text();
    assert.equal(response.status, 200, `${template}/${locale}`);
    assert.match(markup, new RegExp(`lang="${locale}"`), `${template}/${locale}`);
    assert.match(markup, /fenrir-splash-icon-512\.png/, `${template}/${locale}`);
  }
});
