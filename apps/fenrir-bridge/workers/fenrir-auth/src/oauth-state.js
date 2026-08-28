const RECORD_KEY = "state";

export class OAuthStateStore {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    if (request.method === "PUT") {
      const record = await request.json();
      if (!record?.payload || !Number.isFinite(record.expiresAt)) {
        return new Response("invalid_state_record", { status: 400 });
      }
      await this.storage.put(RECORD_KEY, record);
      await this.storage.setAlarm(record.expiresAt);
      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      const record = await this.storage.transaction(async (transaction) => {
        const current = await transaction.get(RECORD_KEY);
        if (current) await transaction.delete(RECORD_KEY);
        return current;
      });
      await this.storage.deleteAlarm();
      if (!record || record.expiresAt <= Date.now()) {
        return new Response(null, { status: 404 });
      }
      return Response.json(record.payload);
    }

    return new Response(null, { status: 405 });
  }

  async alarm() {
    await this.storage.deleteAll();
  }
}
