import { test } from "node:test";
import assert from "node:assert/strict";
import { OAuthStateStore } from "../src/oauth-state.js";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    alarmTime: null,
    async put(key, value) { values.set(key, value); },
    async setAlarm(time) { this.alarmTime = time; },
    async deleteAlarm() { this.alarmTime = null; },
    async deleteAll() { values.clear(); },
    async transaction(callback) {
      return callback({
        get: async (key) => values.get(key),
        delete: async (key) => values.delete(key),
      });
    },
  };
}

test("OAuth state is consumed once from strongly consistent storage", async () => {
  const storage = memoryStorage();
  const state = new OAuthStateStore({ storage });
  const expiresAt = Date.now() + 60_000;
  const saved = await state.fetch(new Request("https://oauth-state/state", {
    method: "PUT",
    body: JSON.stringify({ payload: { provider: "google" }, expiresAt }),
  }));
  assert.equal(saved.status, 204);
  assert.equal(storage.alarmTime, expiresAt);

  const consumed = await state.fetch(new Request("https://oauth-state/state", { method: "DELETE" }));
  assert.deepEqual(await consumed.json(), { provider: "google" });
  assert.equal(storage.alarmTime, null);

  const replay = await state.fetch(new Request("https://oauth-state/state", { method: "DELETE" }));
  assert.equal(replay.status, 404);
});

test("expired OAuth state is deleted and rejected", async () => {
  const storage = memoryStorage();
  const state = new OAuthStateStore({ storage });
  await state.fetch(new Request("https://oauth-state/state", {
    method: "PUT",
    body: JSON.stringify({ payload: { provider: "apple" }, expiresAt: Date.now() - 1 }),
  }));

  const consumed = await state.fetch(new Request("https://oauth-state/state", { method: "DELETE" }));
  assert.equal(consumed.status, 404);
  assert.equal(storage.values.size, 0);
});
