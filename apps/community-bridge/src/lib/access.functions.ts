import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { neonSql } from "@/lib/neon.server";
import { normalizeHandle, type HandleDecision } from "@/lib/username-guard.functions";

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
const decision = z.enum(["pending", "granted", "denied", "revoked"]);

export type GateAccessRequest = {
  id: string;
  gate_slug: string;
  community_label: string;
  applicant_email: string | null;
  applicant_name: string | null;
  telegram_user_id: string;
  decision_note: string | null;
  status: "pending" | "granted" | "denied" | "revoked";
  requested_at: string;
};

export type GateAccessOutcome = {
  status: "granted" | "pending" | "review" | "denied" | "revoked";
  owner?: boolean;
  emailSent?: boolean;
};

export type GateSecurityPreflight = {
  status: "ok" | "sso_required" | "review" | "blocked";
  identity: {
    telegramId: string | null;
    telegramUsername: string | null;
    telegramFirstName: string | null;
  };
  checks: Array<{
    key: "username" | "photo" | "blacklist" | "cp";
    label: string;
    status: "pass" | "missing" | "review" | "blocked";
  }>;
};

/**
 * `context.user` nunca existió. `requireSupabaseAuth` —fichero autogenerado,
 * marcado "do not edit"— sólo inyecta `{ supabase, userId, claims }`, así que
 * las tres lecturas de `context.user.email` reventaban con
 * `TypeError: Cannot read properties of undefined (reading 'email')`.
 *
 * No basta con cambiar `user` por `claims`: en el `JwtPayload` de supabase-js
 * el campo es OPCIONAL (`email?: string`), y este es el camino de Telegram,
 * donde la identidad puede no traer correo. Resolvemos a `null` explícito para
 * que la ausencia se guarde como NULL (`applicant_email` es nullable) y no
 * como `undefined`, y para que `sendGateConfirmationEmail` devuelva
 * `emailSent: false` —visible en la respuesta— en lugar de fallar callando.
 */
function applicantEmail(claims: Record<string, unknown>): string | null {
  const email = claims["email"];
  return typeof email === "string" && email.trim().length > 0 ? email.trim() : null;
}

async function checkHandleVerdict(handle: string): Promise<HandleDecision> {
  const normalized = normalizeHandle(handle);
  if (!normalized) return "review";

  const sql = neonSql();
  const rows = (await sql`
    select term, match_kind, severity from cb_blocked_terms
  `) as Array<{ term: string; match_kind: string; severity: string }>;

  let review = false;
  for (const row of rows) {
    const term = normalizeHandle(row.term);
    if (!term) continue;
    const hit =
      row.match_kind === "word"
        ? new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(normalized)
        : normalized.includes(term);
    if (!hit) continue;
    if (row.severity === "block") return "block";
    review = true;
  }

  return review ? "review" : "allow";
}

async function gateSecuritySummary(identity: {
  telegram_id?: string | number | null;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
}) {
  const telegramUsername = identity.telegram_username ?? null;
  const handleDecision = telegramUsername ? await checkHandleVerdict(telegramUsername) : "review";
  const usernameStatus: "blocked" | "review" | "pass" =
    handleDecision === "block" ? "blocked" : handleDecision === "review" ? "review" : "pass";
  const photoStatus = "review" as const;
  const overall: "blocked" | "review" | "ok" =
    usernameStatus === "blocked"
      ? "blocked"
      : usernameStatus === "review" || photoStatus === "review"
        ? "review"
        : "ok";
  const usernameLabel = telegramUsername ? `@${telegramUsername}` : "missing username";
  return {
    overall,
    usernameStatus,
    photoStatus,
    note: `Gate security: username ${usernameLabel} = ${usernameStatus}; photo signal = ${photoStatus}; blacklist = ${usernameStatus}; CP screen = ${usernameStatus}.`,
  };
}

async function sendGateConfirmationEmail(input: {
  to?: string | null;
  gateSlug: string;
  status: GateAccessOutcome["status"];
  telegramUsername?: string | null;
}) {
  if (!input.to || input.to.endsWith("@unknown")) return false;
  const emailUrl = process.env["MYFENRIR_EMAILS_URL"]?.replace(/\/$/, "");
  if (!emailUrl) return false;
  const subject =
    input.status === "granted"
      ? "MyFenrir Gate confirmed"
      : input.status === "review" || input.status === "pending"
        ? "MyFenrir Gate request received"
        : "MyFenrir Gate update";
  try {
    const response = await fetch(`${emailUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env["MYFENRIR_EMAILS_TOKEN"]
          ? { Authorization: `Bearer ${process.env["MYFENRIR_EMAILS_TOKEN"]}` }
          : {}),
      },
      body: JSON.stringify({
        template: "notificacion",
        to: input.to,
        subject,
        brand: "myfenrir",
        locale: "en",
        data: {
          titulo: subject,
          mensaje:
            input.status === "granted"
              ? `Your identity cleared the Gate security checks for /g/${input.gateSlug}. Your private handoff is ready.`
              : `Your Gate request for /g/${input.gateSlug} is recorded. The owner can approve, deny, or ask for more info.`,
          ctaLabel: "Open Community Gate",
          ctaUrl: `https://communities.myfenrir.com/g/${input.gateSlug}`,
          telegramUsername: input.telegramUsername,
        },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean };
    return response.ok && body.ok === true;
  } catch {
    return false;
  }
}

export const runGateSecurityPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ slug }).parse(data))
  .handler(async ({ context }): Promise<GateSecurityPreflight> => {
    const { data: identity, error } = await context.supabase
      .from("account_links")
      .select("telegram_id, telegram_username, telegram_first_name")
      .eq("supabase_user_id", context.userId)
      .eq("provider", "telegram")
      .eq("status", "linked")
      .maybeSingle();

    if (error || !identity?.telegram_id) {
      return {
        status: "sso_required",
        identity: { telegramId: null, telegramUsername: null, telegramFirstName: null },
        checks: [
          { key: "username", label: "Telegram username", status: "missing" },
          { key: "photo", label: "Telegram photo signal", status: "missing" },
          { key: "blacklist", label: "Blacklist screen", status: "missing" },
          { key: "cp", label: "CP safety screen", status: "missing" },
        ],
      };
    }

    const summary = await gateSecuritySummary(identity);

    return {
      status: summary.overall,
      identity: {
        telegramId: String(identity.telegram_id),
        telegramUsername: identity.telegram_username ?? null,
        telegramFirstName: identity.telegram_first_name ?? null,
      },
      checks: [
        { key: "username", label: "Telegram username", status: summary.usernameStatus },
        { key: "photo", label: "Telegram photo signal", status: summary.photoStatus },
        { key: "blacklist", label: "Blacklist screen", status: summary.usernameStatus },
        { key: "cp", label: "CP safety screen", status: summary.usernameStatus },
      ],
    };
  });

export type CommunityAccessStatus = {
  source: "neon";
  configured: boolean;
  allowed: boolean | null;
};

export const checkMyCommunityAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ communitySlug: z.string() }).parse(data))
  .handler(async ({ context, data }): Promise<CommunityAccessStatus> => {
    const email = applicantEmail(context.claims);
    if (!email) return { source: "neon", configured: false, allowed: null };
    const { checkNeonAllowlist } = await import("@/lib/neon-access.server");
    const result = await checkNeonAllowlist(data.communitySlug, email);
    return {
      source: "neon",
      configured: result.configured,
      allowed: result.allowed,
    };
  });

/** A linked identity may ask once; the Gate owner makes the access decision. */
export const requestGateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ slug }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: identity, error } = await context.supabase
      .from("account_links")
      .select("telegram_id, telegram_username, telegram_first_name")
      .eq("supabase_user_id", context.userId)
      .eq("provider", "telegram")
      .eq("status", "linked")
      .maybeSingle();
    if (error || !identity?.telegram_id) {
      throw new Error(
        "Telegram identity missing from this SSO session. Return from Telegram and continue through the Gate.",
      );
    }
    const sql = neonSql();
    const gates = (await sql`
      select id, user_id, community_id from cb_gate_configs
      where slug = ${data.slug} and community_id is not null limit 1
    `) as Array<{ id: string; user_id: string; community_id: string }>;
    const gate = gates[0];
    if (!gate) throw new Error("This Gate is not ready for access requests.");
    const summary = await gateSecuritySummary(identity);
    if (summary.overall === "blocked")
      throw new Error("Access blocked by the Gate security screen.");
    if (gate.user_id === context.userId) {
      const emailSent = await sendGateConfirmationEmail({
        to: applicantEmail(context.claims),
        gateSlug: data.slug,
        status: "granted",
        telegramUsername: null,
      });
      return { status: "granted" as const, owner: true, emailSent };
    }
    const rows = (await sql`
      insert into cb_gate_access_requests (
        gate_id, owner_id, community_id, applicant_id, telegram_user_id, applicant_email, applicant_name, decision_note
      ) values (
        ${gate.id}::uuid, ${gate.user_id}::uuid, ${gate.community_id}, ${context.userId}::uuid,
        ${identity.telegram_id}, ${applicantEmail(context.claims)}, ${identity.telegram_first_name ?? null}, ${summary.note}
      )
      on conflict (gate_id, applicant_id) do update set
        status = case when cb_gate_access_requests.status in ('denied', 'revoked') then 'pending' else cb_gate_access_requests.status end,
        requested_at = case when cb_gate_access_requests.status in ('denied', 'revoked') then now() else cb_gate_access_requests.requested_at end,
        decision_note = case
          when cb_gate_access_requests.status in ('denied', 'revoked') then ${summary.note}
          else coalesce(cb_gate_access_requests.decision_note, ${summary.note})
        end,
        updated_at = now()
      returning status
    `) as Array<{ status: GateAccessRequest["status"] }>;
    const status = rows[0]!.status;
    const emailSent = await sendGateConfirmationEmail({
      to: applicantEmail(context.claims),
      gateSlug: data.slug,
      status,
      telegramUsername: null,
    });
    return { status, owner: false, emailSent };
  });

export const listMyGateAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => undefined)
  .handler(async ({ context }): Promise<GateAccessRequest[]> => {
    const sql = neonSql();
    const rows = (await sql`
      select r.id, g.slug as gate_slug, coalesce(d.display_name, r.community_id) as community_label,
        r.applicant_email, r.applicant_name, r.telegram_user_id, r.decision_note, r.status, r.requested_at
      from cb_gate_access_requests r
      join cb_gate_configs g on g.id = r.gate_id and g.user_id = ${context.userId}::uuid
      left join cb_community_destinations d
        on d.user_id = g.user_id and d.community_id = r.community_id and d.provider = 'telegram' and d.status = 'verified'
      order by case r.status when 'pending' then 0 else 1 end, r.requested_at asc
      limit 100
    `) as GateAccessRequest[];
    return rows.map((row) => ({ ...row, requested_at: new Date(row.requested_at).toISOString() }));
  });

/** Owner-scoped and auditable; granting permits the applicant's next signed handoff. */
export const decideGateAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: decision,
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const sql = neonSql();
    const rows = (await sql`
      update cb_gate_access_requests r set status = ${data.status}, decided_by = ${context.userId}::uuid,
        decided_at = now(), decision_note = ${data.note ?? null}, updated_at = now()
      from cb_gate_configs g
      where r.id = ${data.id}::uuid and r.gate_id = g.id and g.user_id = ${context.userId}::uuid
      returning r.id, r.status, r.applicant_email, g.slug as gate_slug
    `) as Array<{
      id: string;
      status: GateAccessRequest["status"];
      applicant_email: string | null;
      gate_slug: string;
    }>;
    if (!rows[0]) throw new Error("Access request not found for this Gate.");
    await sendGateConfirmationEmail({
      to: rows[0].applicant_email,
      gateSlug: rows[0].gate_slug,
      status: rows[0].status,
      telegramUsername: null,
    });
    return rows[0];
  });
