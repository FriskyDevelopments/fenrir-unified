import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireCommunitySession } from "@/lib/authentik.functions";
import { neonSql } from "@/lib/neon.server";

// Vistas de gates en Neon (cb_gate_views); la sesión sigue siendo Supabase.
export interface GateViewStats {
  gate_id: string;
  total: number;
  last7: number;
  /** Oldest → newest, always 7 entries (UTC days). */
  daily: { date: string; views: number }[];
}

const DAYS = 7;

function utcDay(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function emptyDays(): { date: string; views: number }[] {
  const today = new Date();
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
    return { date: utcDay(d), views: 0 };
  });
}

/** Cookie holding an opaque visitor id used only for view deduping. */
const VISITOR_COOKIE = "fg_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function utcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Reads the visitor cookie, minting (and setting) one on first sight. */
function resolveVisitorId(): string {
  const existing = getCookie(VISITOR_COOKIE);
  if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;

  const fresh = crypto.randomUUID().replace(/-/g, "");
  setCookie(VISITOR_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return fresh;
}

/**
 * Records one view of a public gate, deduped to once per visitor per gate
 * per UTC day via an httpOnly cookie plus a unique index on
 * (gate_id, visitor_key). Public on purpose (visitors are anonymous), so no
 * caller-supplied data is trusted beyond the slug.
 *
 * Returns `unique: false` when the visitor already counted today — the client
 * uses that to keep PostHog in sync with the local panel.
 */
export const recordGateView = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .max(60)
          .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
        referrer: z.string().trim().max(2048).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const sql = neonSql();

    const gates = (await sql`
      select id from cb_gate_configs where slug = ${data.slug} limit 1
    `) as Array<{ id: string }>;
    const gate = gates[0];
    if (!gate) return { ok: false as const, unique: false };

    let referrerHost: string | null = null;
    if (data.referrer) {
      try {
        referrerHost = new URL(data.referrer).hostname.slice(0, 120);
      } catch {
        referrerHost = null;
      }
    }

    const visitorKey = `${resolveVisitorId()}:${utcDayKey()}`;

    try {
      // on conflict do nothing: el segundo insert del mismo
      // (gate, visitante, día) es un no-op, no un conteo inflado.
      const inserted = (await sql`
        insert into cb_gate_views (gate_id, referrer_host, visitor_key)
        values (${gate.id}, ${referrerHost}, ${visitorKey})
        on conflict (gate_id, visitor_key) do nothing
        returning id
      `) as Array<{ id: string }>;
      return { ok: true as const, unique: inserted.length > 0 };
    } catch {
      return { ok: false as const, unique: false };
    }
  });

/** Per-gate view stats for every gate the signed-in user owns. */
export const getMyGateViewStats = createServerFn({ method: "GET" })
  .middleware([requireCommunitySession])
  .inputValidator(() => undefined)
  .handler(async ({ context }) => {
    const sql = neonSql();

    const gates = (await sql`
      select id from cb_gate_configs
      where user_id = ${context.userId}
    `) as Array<{ id: string }>;
    const ids = gates.map((g) => g.id);
    if (ids.length === 0) return [] as GateViewStats[];

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));
    since.setUTCHours(0, 0, 0, 0);

    const [recent, totals] = await Promise.all([
      sql`
        select gate_id, viewed_at from cb_gate_views
        where gate_id = any(${ids}::uuid[]) and viewed_at >= ${since.toISOString()}
        limit 50000
      ` as Promise<Array<{ gate_id: string; viewed_at: string | Date }>>,
      sql`
        select gate_id from cb_gate_views
        where gate_id = any(${ids}::uuid[])
        limit 50000
      ` as Promise<Array<{ gate_id: string }>>,
    ]);

    const stats = new Map<string, GateViewStats>(
      ids.map((id) => [id, { gate_id: id, total: 0, last7: 0, daily: emptyDays() }]),
    );

    for (const row of totals) {
      const entry = stats.get(row.gate_id);
      if (entry) entry.total += 1;
    }

    for (const row of recent) {
      const entry = stats.get(row.gate_id);
      if (!entry) continue;
      const day = utcDay(row.viewed_at as string);
      const bucket = entry.daily.find((d) => d.date === day);
      if (bucket) {
        bucket.views += 1;
        entry.last7 += 1;
      }
    }

    return [...stats.values()];
  });
