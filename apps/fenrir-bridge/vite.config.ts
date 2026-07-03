import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fenrirDevMockApi } from "./dev/mockApi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseAuthBase = normalizeExternalAuthBase(env.VITE_SUPABASE_URL);

  return {
    plugins: [
      react(),
      // Serve-time only; enabled by `npm run dev:mock` for UI work without WorkOS/Neon.
      ...(env.FENRIR_DEV_MOCK_API === "1" ? [fenrirDevMockApi()] : []),
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
    server: {
      port: 5177
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
