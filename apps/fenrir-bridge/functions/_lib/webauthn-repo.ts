import type { WebAuthnCredential } from '@simplewebauthn/server';

function nowIso() {
  return new Date().toISOString();
}

export type StoredCredentialRow = {
  credential_id: string;
  frisky_user_id: string;
  frisky_org_id: string;
  email: string;
  display_name: string;
  public_key_b64: string;
  counter: number;
  transports: string | null;
};

export function uint8ToBase64(u8: Uint8Array): string {
  let binary = '';
  for (const b of u8) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function listExcludeCredentials(db: D1Database, friskyUserId: string) {
  const { results } = await db
    .prepare(`SELECT credential_id, transports FROM webauthn_credentials WHERE frisky_user_id = ?`)
    .bind(friskyUserId)
    .all<{ credential_id: string; transports: string | null }>();
  return (results ?? []).map((row) => ({
    id: row.credential_id,
    transports: row.transports
      ? (JSON.parse(row.transports) as WebAuthnCredential['transports'])
      : undefined,
  }));
}

export async function insertCredential(
  db: D1Database,
  input: {
    credentialId: string;
    friskyUserId: string;
    friskyOrgId: string;
    email: string;
    displayName: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: WebAuthnCredential['transports'];
  }
) {
  const t = nowIso();
  await db
    .prepare(
      `INSERT INTO webauthn_credentials (
        credential_id, frisky_user_id, frisky_org_id, email, display_name,
        public_key_b64, counter, transports, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.credentialId,
      input.friskyUserId,
      input.friskyOrgId,
      input.email,
      input.displayName,
      uint8ToBase64(input.publicKey),
      input.counter,
      input.transports?.length ? JSON.stringify(input.transports) : null,
      t,
      t
    )
    .run();
}

export async function getCredentialById(
  db: D1Database,
  credentialId: string
): Promise<StoredCredentialRow | null> {
  const row = await db
    .prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`)
    .bind(credentialId)
    .first<StoredCredentialRow>();
  return row ?? null;
}

export async function updateCredentialCounter(
  db: D1Database,
  credentialId: string,
  counter: number
) {
  await db
    .prepare(`UPDATE webauthn_credentials SET counter = ?, updated_at = ? WHERE credential_id = ?`)
    .bind(counter, nowIso(), credentialId)
    .run();
}

export function rowToWebAuthnCredential(row: StoredCredentialRow): WebAuthnCredential {
  return {
    id: row.credential_id,
    publicKey: base64ToUint8(row.public_key_b64),
    counter: row.counter,
    transports: row.transports
      ? (JSON.parse(row.transports) as WebAuthnCredential['transports'])
      : undefined,
  };
}

export async function countCredentialsForUser(
  db: D1Database,
  friskyUserId: string
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) as n FROM webauthn_credentials WHERE frisky_user_id = ?`)
    .bind(friskyUserId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
