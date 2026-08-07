import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installHoneybadgerBrowserReporter } from "./services/honeybadger";
import { installPosthog } from "./services/posthog";
import "./styles/global.css";

installHoneybadgerBrowserReporter();
// Analítica de producto + session replay + flags. No-op sin
// VITE_POSTHOG_PROJECT_TOKEN, así que arrancar sin configurar no cambia nada.
installPosthog();

// Expose a non-sensitive release marker and force a fresh content hash when a
// broken edge response has been cached under a previous asset URL.
document.documentElement.dataset.fenrirRelease = "supabase-auth-2026-08-07b";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
