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
});

test("preview renders a complete branded email", async () => {
  const response = await request("/preview/bienvenida?brand=myfenrir");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /MYFENRIR/);
  assert.match(html, /Bienvenido, Francisco/);
  assert.match(html, /Abrir mi panel/);
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
  assert.match(String((delivered as any)?.html), /Entrar a MyFenrir/);
  assert.match(String((delivered as any)?.text), /https:\/\/myfenrir\.com\/main\?test=1/);
});
