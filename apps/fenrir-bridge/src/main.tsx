import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installHoneybadgerBrowserReporter } from "./services/honeybadger";
import "./styles/global.css";

const WowMvpRoute = lazy(() =>
  import("./routes/WowMvpRoute").then((module) => ({ default: module.WowMvpRoute }))
);

installHoneybadgerBrowserReporter();
// Analítica de producto + session replay + flags. Se carga de forma diferida
// (dynamic import) para que `posthog-js` —el módulo de terceros más pesado del
// bundle— NO entre en el chunk inicial y la landing arranque con un shell más
// chico. No-op sin VITE_POSTHOG_PROJECT_TOKEN, así que arrancar sin configurar
// no cambia nada. Se dispara en idle para no competir con el primer render.
function bootPosthog() {
  void import("./services/posthog")
    .then(({ installPosthog }) => installPosthog())
    .catch(() => {
      // La analítica nunca puede impedir que la app arranque.
    });
}
if (typeof window !== "undefined") {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") ric(bootPosthog);
  else window.setTimeout(bootPosthog, 0);
}

// Expose a non-sensitive release marker and force a fresh content hash when a
// broken edge response has been cached under a previous asset URL.
document.documentElement.dataset.fenrirRelease = "better-auth-2026-08-28";

const isWowMvpRoute = window.location.pathname === "/wow" || window.location.pathname === "/visual-lab";
if (isWowMvpRoute) document.documentElement.classList.add("fenrir-wow-shell");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isWowMvpRoute ? (
      <Suspense fallback={<div className="boot">Awakening Fenrir…</div>}><WowMvpRoute /></Suspense>
    ) : <App />}
  </StrictMode>
);
