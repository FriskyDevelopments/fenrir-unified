import { getMigrations } from "better-auth/db/migration";

import {
  constantTimeEqual,
  createFriskyBetterAuth,
  truthy,
  type FriskyBetterAuthEnv,
} from "../../../_lib/better-auth";
import { noStoreJson } from "../../../_lib/responses";

export const onRequestPost: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  const expected = context.env.BETTER_AUTH_MIGRATION_TOKEN?.trim() ?? "";
  const supplied = context.request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (
    !truthy(context.env.BETTER_AUTH_MIGRATION_ENABLED) ||
    !expected ||
    !supplied ||
    !constantTimeEqual(expected, supplied)
  ) {
    return noStoreJson({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { auth, pool } = createFriskyBetterAuth(context.env);
  try {
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
    return noStoreJson({
      ok: true,
      engine: "better-auth",
      created: migrations.toBeCreated.length,
      altered: migrations.toBeAdded.length,
    });
  } finally {
    await pool.end();
  }
};
