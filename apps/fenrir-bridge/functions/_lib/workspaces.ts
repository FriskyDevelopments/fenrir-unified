import type { SessionPayload } from "./auth";

const nowIso = () => new Date().toISOString();

export async function ensureDefaultWorkspace(db: D1Database, session: SessionPayload) {
  const ts = nowIso();

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
