import { SessionAuthority } from "../src/session.js";

function memoryStorage() {
  const values = new Map();
  let alarm = null;
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(keys) {
      if (Array.isArray(keys)) {
        for (const key of keys) values.delete(key);
        return;
      }
      values.delete(keys);
    },
    async list({ prefix = "" } = {}) {
      return new Map([...values].filter(([key]) => key.startsWith(prefix)));
    },
    async getAlarm() {
      return alarm;
    },
    async setAlarm(scheduledTime) {
      alarm = Number(scheduledTime);
    },
    async deleteAlarm() {
      alarm = null;
    },
    async deleteAll() {
      values.clear();
      alarm = null;
    },
  };
}

export function memorySessionAuthority() {
  const objects = new Map();

  function object(name) {
    if (!objects.has(name)) {
      const storage = memoryStorage();
      objects.set(name, {
        storage,
        instance: new SessionAuthority({ storage }),
        tail: Promise.resolve(),
      });
    }
    return objects.get(name);
  }

  return {
    objects,
    idFromName(name) {
      return name;
    },
    get(id) {
      const target = object(id);
      return {
        fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          const run = () => target.instance.fetch(request);
          const response = target.tail.then(run, run);
          target.tail = response.then(() => undefined, () => undefined);
          return response;
        },
      };
    },
  };
}
