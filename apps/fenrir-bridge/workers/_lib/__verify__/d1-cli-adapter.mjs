/**
 * d1-cli-adapter — a D1-shaped facade over `wrangler d1 execute --remote`.
 *
 * Verification only. It lets membership-facts.js run its REAL SQL against the
 * REAL production database from a local Node process, so what we validate is
 * the shipping code path rather than a hand-made fixture.
 */
import { execFileSync } from "node:child_process";

const DB_NAME = process.env.FENRIR_D1_NAME || "fenrir-bridge";

function inline(value) {
  return value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;
}

function exec(sql, params) {
  // Positional ?N params are inlined as quoted literals. Verification-only: the
  // inputs are org ids we just read out of this same database.
  let bound = sql;
  params.forEach((value, index) => {
    bound = bound.split(`?${index + 1}`).join(inline(value));
  });
  let cursor = 0;
  bound = bound.replace(/\?(?!\d)/g, () => inline(params[cursor++]));

  const out = execFileSync(
    "npx",
    ["--yes", "wrangler@4.90.0", "d1", "execute", DB_NAME, "--remote", "--yes", "--json", "--command", bound],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024 * 24 }
  );
  const start = out.indexOf("[");
  if (start < 0) throw new Error(`unexpected wrangler output: ${out.slice(0, 400)}`);
  const payload = JSON.parse(out.slice(start))[0] ?? {};
  return { results: payload.results ?? [], meta: payload.meta ?? {} };
}

export const db = {
  prepare(sql) {
    const make = (params) => ({
      first: async () => exec(sql, params).results[0] ?? null,
      all: async () => exec(sql, params),
      // `changes` is what the confirmation claim relies on to detect whether it
      // won the INSERT ... ON CONFLICT DO NOTHING race.
      run: async () => {
        const { results, meta } = exec(sql, params);
        return { success: true, results, meta };
      },
    });
    return { bind: (...params) => make(params), ...make([]) };
  },
};
