/**
 * panel-preview — mounts the REAL MembershipPanel once per render state.
 *
 * Each instance is pointed at its own blob: URL carrying that case's JSON, so
 * every panel genuinely fetches and parses its own response through the real
 * code path. No global fetch monkey-patching (which silently gave every panel
 * the last-registered stub).
 */
import { createRoot } from "react-dom/client";
import MembershipPanel from "../MembershipPanel";

declare global {
  interface Window {
    __CASES__: Array<{ label: string; response: unknown }>;
    __LOCALE__?: "en" | "es";
  }
}

const blobUrl = (payload: unknown) =>
  URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" }));

createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 760, margin: "0 auto", padding: 36 }}>
    {window.__CASES__.map((c, i) => (
      <div key={i} style={{ marginBottom: 30 }}>
        <div style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: "0.18em",
          textTransform: "uppercase", color: "#7fae9d", marginBottom: 10,
        }}>{c.label}</div>
        <MembershipPanel
          locale={window.__LOCALE__ ?? "en"}
          endpoint={blobUrl(c.response)}
          onSeePlans={() => {}}
        />
      </div>
    ))}
  </div>
);
