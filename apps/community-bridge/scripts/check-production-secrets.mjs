#!/usr/bin/env node
/**
 * Prevents a Community Bridge deployment whose static shell loads but whose
 * server-side Gate actions fail at runtime because bindings were omitted.
 *
 * The command deliberately lists secret *names* only; it never reads or
 * prints secret values.
 */
import { execFileSync } from "node:child_process";

const workerName = process.env.COMMUNITY_BRIDGE_WORKER_NAME ||
  "frisky-developments-llc-fenrir-unified-fenrir-unified-apps-community-bridge";

const required = [
  "NEON_DATABASE_URL",
  "FENRIR_GATE_ACCESS_SECRET",
  // Sin estas tres el shell SSR carga pero TODA función de servidor detrás de
  // requireSupabaseAuth lanza en runtime ("Missing Supabase environment
  // variable(s): …"). Es exactamente el fallo que este preflight existe para
  // impedir, y llegó a producción el 2026-08-20 porque no estaban listadas.
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

let output;
try {
  output = execFileSync("npx", ["wrangler", "secret", "list", "--name", workerName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  const stderr = String(error?.stderr || "").trim();
  console.error(`Could not inspect production secrets for ${workerName}.`);
  if (stderr) console.error(stderr);
  process.exit(2);
}

let secrets;
try {
  secrets = JSON.parse(output).map((entry) => entry.name);
} catch {
  console.error("Cloudflare returned an unexpected secret inventory response.");
  process.exit(2);
}

const missing = required.filter((name) => !secrets.includes(name));
if (missing.length) {
  console.error(`Refusing to deploy ${workerName}: missing required production secrets:`);
  for (const name of missing) console.error(`- ${name}`);
  console.error("Provision the encrypted secrets, then run this preflight again.");
  process.exit(1);
}

console.log(`Production secret preflight passed for ${workerName}.`);
