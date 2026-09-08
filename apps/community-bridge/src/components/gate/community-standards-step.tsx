import { useMemo, useState } from "react";
import { Check, ShieldAlert, ShieldCheck, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityStandards, type StandardsRule } from "@/config/community-standards";

/**
 * Primer paso del onboarding: las normas que el operador acepta antes de
 * construir su gate. Se muestra una vez (queda registrado en localStorage) y
 * en el idioma del navegador — en · es · fr · de.
 *
 * Va ANTES del builder a propósito: quien abre una puerta debe saber qué se
 * hace cumplir del otro lado antes de tener una puerta que administrar.
 */

const ACK_KEY = "myfenrir-community-standards-accepted";

const TONE: Record<StandardsRule["tone"], { icon: typeof ShieldCheck; className: string }> = {
  allow: {
    icon: ShieldCheck,
    className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  },
  ban: { icon: ShieldAlert, className: "text-red-400 border-red-400/30 bg-red-400/5" },
  duty: { icon: Scale, className: "text-amber-400 border-amber-400/30 bg-amber-400/5" },
};

/** ¿Ya aceptó estas normas en este navegador? */
export function hasAcceptedStandards(): boolean {
  try {
    return window.localStorage.getItem(ACK_KEY) === "1";
  } catch {
    // Sin storage preferimos volver a mostrarlas: es el lado seguro.
    return false;
  }
}

export function CommunityStandardsStep({ onAccept }: { onAccept: () => void }) {
  const copy = useMemo(() => getCommunityStandards(), []);
  const [checked, setChecked] = useState(false);

  function accept() {
    try {
      window.localStorage.setItem(ACK_KEY, "1");
    } catch {
      // Si no se puede guardar, seguimos igual: no bloqueamos por eso.
    }
    onAccept();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10" data-testid="community-standards">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        {copy.eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{copy.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>

      <ul className="mt-8 space-y-3">
        {copy.rules.map((rule) => {
          const { icon: Icon, className } = TONE[rule.tone];
          return (
            <li key={rule.title} className={`rounded-lg border p-4 ${className}`}>
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{rule.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rule.body}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          data-testid="standards-ack"
        />
        <span className="text-sm text-foreground">{copy.acknowledge}</span>
      </label>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{copy.legalNote}</p>

      <Button className="mt-6 w-full" disabled={!checked} onClick={accept}>
        <Check className="mr-2 h-4 w-4" />
        {copy.continueLabel}
      </Button>
    </div>
  );
}
