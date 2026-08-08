import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gate } = await supabaseAdmin
      .from("gate_configs")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
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

    // The partial unique index makes the second insert of the same
    // (gate, visitor, day) a no-op instead of an inflated count.
    const { data: inserted, error } = await supabaseAdmin
      .from("gate_views")
      .upsert(
        { gate_id: gate.id, referrer_host: referrerHost, visitor_key: visitorKey },
        { onConflict: "gate_id,visitor_key", ignoreDuplicates: true },
      )
      .select("id");

    if (error) return { ok: false as const, unique: false };

    return { ok: true as const, unique: (inserted ?? []).length > 0 };
  });

/** Per-gate view stats for every gate the signed-in user owns. */
export const getMyGateViewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        brand_id: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Invalid brand"),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: gates, error: gatesError } = await context.supabase
      .from("gate_configs")
      .select("id")
      .eq("user_id", context.userId)
      .eq("brand_id", data.brand_id);
    if (gatesError) throw new Error(gatesError.message);

    const ids = (gates ?? []).map((g) => g.id as string);
    if (ids.length === 0) return [] as GateViewStats[];

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));
    since.setUTCHours(0, 0, 0, 0);

    const [recent, totals] = await Promise.all([
      context.supabase
        .from("gate_views")
        .select("gate_id, viewed_at")
        .in("gate_id", ids)
        .gte("viewed_at", since.toISOString())
        .limit(50000),
      context.supabase.from("gate_views").select("gate_id").in("gate_id", ids).limit(50000),
    ]);
    if (recent.error) throw new Error(recent.error.message);
    if (totals.error) throw new Error(totals.error.message);

    const stats = new Map<string, GateViewStats>(
      ids.map((id) => [id, { gate_id: id, total: 0, last7: 0, daily: emptyDays() }]),
    );

    for (const row of totals.data ?? []) {
      const entry = stats.get(row.gate_id as string);
      if (entry) entry.total += 1;
    }

    for (const row of recent.data ?? []) {
      const entry = stats.get(row.gate_id as string);
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
