import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Shared Gate branding source of truth (packages/gate-brand), consumed by the
// /wow visual lab so its presets can never drift from Community Bridge.
const gateBrand = path.resolve(import.meta.dirname, "../../packages/gate-brand/src/presets.ts");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseAuthBase = normalizeExternalAuthBase(env.VITE_SUPABASE_URL);

  return {
    plugins: [
      react(),
      {
        name: "fenrir-local-supabase-auth-redirect",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const requestUrl = req.url ?? "";
            if (!requestUrl.startsWith("/auth/v1/")) {
              next();
              return;
            }

            if (!supabaseAuthBase) {
              console.warn(`Vite local redirect blocked: VITE_SUPABASE_URL is "${env.VITE_SUPABASE_URL}"`);
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end("Fenrir auth is misconfigured: VITE_SUPABASE_URL must be the raw Supabase project URL, not localhost or myfenrir.com.");
              return;
            }

            res.statusCode = 302;
            res.setHeader("Location", `${supabaseAuthBase}${requestUrl.replace(/}+$/, "")}`);
            res.end();
          });
        }
      }
    ],
    resolve: {
      alias: {
        "@frisky/gate-brand": gateBrand,
        "@frisky/auth/client": path.resolve(import.meta.dirname, "../../packages/auth/src/client.ts"),
        "@frisky/auth/server": path.resolve(import.meta.dirname, "../../packages/auth/src/server.ts"),
        "@frisky/auth": path.resolve(import.meta.dirname, "../../packages/auth/src/index.ts")
      }
    },
    server: {
      port: 5177,
      fs: {
        allow: ["..", "../../packages"]
      }
    }
  };
});

function normalizeExternalAuthBase(value?: string) {
  const cleaned = (value ?? "").trim().replace(/}+$/, "");
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".myfenrir.com") || url.hostname === "myfenrir.com") {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}
