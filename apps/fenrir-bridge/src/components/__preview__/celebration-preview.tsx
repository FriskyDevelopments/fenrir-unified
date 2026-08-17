/**
 * celebration-preview — mounts the REAL PackCelebration component so the
 * screenshot is of shipping code, not a mockup. Facts are injected by the
 * shoot script from a live getMembershipFacts() run against production D1.
 */
import { createRoot } from "react-dom/client";
import PackCelebration, { type MembershipFacts } from "../PackCelebration";

declare global {
  interface Window {
    __FACTS__: MembershipFacts;
    __LOCALE__?: "en" | "es";
  }
}

createRoot(document.getElementById("root")!).render(
  <PackCelebration
    facts={window.__FACTS__}
    locale={window.__LOCALE__ ?? "en"}
    onDismiss={() => {}}
    onOpenPortal={() => {}}
  />
);
