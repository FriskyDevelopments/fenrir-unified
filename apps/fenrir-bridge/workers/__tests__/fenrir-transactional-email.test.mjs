import assert from "node:assert/strict";
import test from "node:test";
import worker from "../fenrir-transactional-email.js";

test("only exposes the internal send endpoint", async () => {
  const response = await worker.fetch(new Request("https://email.internal/health"), {});
  assert.equal(response.status, 404);
});

test("rejects a message whose sender is not the approved MyFenrir address", async () => {
  const response = await worker.fetch(new Request("https://email.internal/send", {
    method: "POST",
    body: JSON.stringify({
      to: "member@example.com",
      subject: "Membership confirmed",
      from: { email: "wrong@example.com" },
    }),
  }), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "invalid_message" });
});

test("delivers only a valid MyFenrir message through the email binding", async () => {
  const calls = [];
  const message = {
    to: "member@example.com",
    subject: "Membership confirmed",
    from: { email: "noreply@myfenrir.com", name: "MyFenrir" },
    text: "Your membership is active.",
  };
  const response = await worker.fetch(new Request("https://email.internal/send", {
    method: "POST",
    body: JSON.stringify(message),
  }), { EMAIL: { send: async (value) => calls.push(value) } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [message]);
});
