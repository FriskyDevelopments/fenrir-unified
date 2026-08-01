import { stableFriskyId, type SessionPayload } from "./auth";

const nowIso = () => new Date().toISOString();

/**
 * Provision the user + default workspace, and return the CANONICAL session.
 *
 * The email is the join key for the human. frisky_user_id is derived from the
 * auth-broker identity (supabase:…, workos:…, telegram:…), so the same person
 * arriving through a different broker gets a different candidate id — and the
 * naive insert then dies on the app_users.email UNIQUE constraint (that is the
 * "D1_ERROR: UNIQUE constraint failed: app_users.email" login failure). When a
 * row already owns this email, we adopt ITS frisky_user_id (and its derived
 * org) so workspaces stay attached and logins survive broker changes.
 */
export async function ensureDefaultWorkspace(db: D1Database, session: SessionPayload): Promise<SessionPayload> {
  const ts = nowIso();

  const existing = await db
    .prepare(`SELECT frisky_user_id FROM app_users WHERE email = ?`)
    .bind(session.email)
    .first<{ frisky_user_id: string }>();

  let canonical = session;
  if (existing?.frisky_user_id && existing.frisky_user_id !== session.frisky_user_id) {
    const adoptedUserId = existing.frisky_user_id;
    canonical = {
      ...session,
      frisky_user_id: adoptedUserId,
      frisky_org_id: stableFriskyId("org", adoptedUserId)
    };
  }

  await upsertRows(db, canonical, ts);
  return canonical;
}

async function upsertRows(db: D1Database, session: SessionPayload, ts: string) {
  await db
    .prepare(
      `INSERT INTO app_users (
        frisky_user_id, email, display_name, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(frisky_user_id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        auth_provider = excluded.auth_provider,
        updated_at = excluded.updated_at`
    )
    .bind(session.frisky_user_id, session.email, session.name, session.provider, ts, ts)
    .run();

  await db
    .prepare(
      `INSERT INTO workspaces (
        frisky_org_id, owner_user_id, name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(frisky_org_id) DO UPDATE SET
        owner_user_id = excluded.owner_user_id,
        updated_at = excluded.updated_at`
    )
    .bind(session.frisky_org_id, session.frisky_user_id, `${session.name}'s Fenrir`, ts, ts)
    .run();

  await db
    .prepare(
      `INSERT INTO workspace_members (
        frisky_org_id, frisky_user_id, role, created_at, updated_at
      ) VALUES (?, ?, 'owner', ?, ?)
      ON CONFLICT(frisky_org_id, frisky_user_id) DO UPDATE SET
        role = workspace_members.role,
        updated_at = excluded.updated_at`
    )
    .bind(session.frisky_org_id, session.frisky_user_id, ts, ts)
    .run();
}
