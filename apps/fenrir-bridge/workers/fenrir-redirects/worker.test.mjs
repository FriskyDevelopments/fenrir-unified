import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

test("www.myfenrir.com canonicalizes to the apex", async () => {
  const response = await worker.fetch(new Request("https://www.myfenrir.com/login?next=/main"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://myfenrir.com/login?next=/main");
});

test("http www hops once to https apex", async () => {
  const response = await worker.fetch(new Request("http://www.myfenrir.com/main"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://myfenrir.com/main");
});

test("http apex upgrades to https apex without bouncing to www", async () => {
  const response = await worker.fetch(new Request("http://myfenrir.com/login"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://myfenrir.com/login");
});

test("https apex passes through to the origin", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });
  try {
    const response = await worker.fetch(new Request("https://myfenrir.com/login"));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
  } finally {
    globalThis.fetch = original;
  }
});
