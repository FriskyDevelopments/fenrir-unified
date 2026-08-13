import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type CommunityArrivalProps = {
  onEnter: () => void;
};

/**
 * The Community Bridge arrives before the legal/operational setup. It is a
 * short, purposeful transition from MyFenrir identity to community ownership,
 * not another landing page and never a fake loading delay.
 */
export function CommunityArrival({ onEnter }: CommunityArrivalProps) {
  return (
    <section className="community-arrival" aria-labelledby="community-arrival-title">
      <div className="community-arrival__field" aria-hidden="true">
        <span className="community-arrival__orbit community-arrival__orbit--outer" />
        <span className="community-arrival__orbit community-arrival__orbit--inner" />
        <span className="community-arrival__flare community-arrival__flare--one" />
        <span className="community-arrival__flare community-arrival__flare--two" />
      </div>

      <div className="community-arrival__content">
        <div className="community-arrival__mark" aria-hidden="true">
          <img src="/fenrir-mark.svg" alt="" />
        </div>
        <p className="community-arrival__eyebrow">MYFENRIR · COMMUNITY BRIDGE</p>
        <h1 id="community-arrival-title">Your identity has crossed the threshold.</h1>
        <p>
          This is where your community becomes a place with its own rules, gate, and living signal.
        </p>
        <Button variant="fenrir" size="lg" onClick={onEnter} className="community-arrival__cta">
          Enter the gate <ArrowRight aria-hidden="true" />
        </Button>
        <span className="community-arrival__trust"><ShieldCheck aria-hidden="true" /> Your MyFenrir session stays with you.</span>
      </div>
    </section>
  );
}
