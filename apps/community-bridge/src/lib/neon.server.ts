// Neon es la base de datos canónica del Community Bridge (datos de comunidad:
// gates, tenants, auditoría, vistas). La identidad y los roles siguen en
// Supabase Auth — ese es el reparto definido del Protocolo Fenrir.
// Server-only: nunca importar desde código de cliente.
import { neon } from "@neondatabase/serverless";

let cached: ReturnType<typeof neon> | null = null;

export function neonSql() {
  if (cached) return cached;
  const url = process.env["NEON_DATABASE_URL"];
  if (!url) throw new Error("neon_not_configured: set NEON_DATABASE_URL");
  cached = neon(url);
  return cached;
}

/** Postgres unique-violation → true (misma semántica que el código Supabase). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === "23505" || /duplicate key|unique/i.test(e?.message ?? "");
}
