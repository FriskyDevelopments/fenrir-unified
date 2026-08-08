/**
 * Simple theme editor: edits the brand's CSS custom properties (primary,
 * background, foreground, …) with color swatches and writes them straight back
 * into the tenant's `theme` record, which is what the app injects at runtime.
 */

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hexToOklch, oklchToHex } from "@/lib/color";

interface TokenSpec {
  key: string;
  label: string;
  hint: string;
  fallback: string;
}

/** The tokens worth exposing in a simple editor — everything else is custom. */
export const CORE_THEME_TOKENS: TokenSpec[] = [
  {
    key: "--primary",
    label: "Primary",
    hint: "Buttons, links, focus rings",
    fallback: "oklch(0.637 0.208 25.3)",
  },
  {
    key: "--background",
    label: "Background",
    hint: "Page canvas",
    fallback: "oklch(0.149 0.017 259.9)",
  },
  {
    key: "--foreground",
    label: "Foreground",
    hint: "Body text",
    fallback: "oklch(0.97 0.005 260)",
  },
  {
    key: "--card",
    label: "Card",
    hint: "Panels and surfaces",
    fallback: "oklch(0.19 0.02 260)",
  },
  {
    key: "--border",
    label: "Border",
    hint: "Dividers and outlines",
    fallback: "oklch(0.32 0.02 260)",
  },
  {
    key: "--accent",
    label: "Accent",
    hint: "Secondary highlights",
    fallback: "oklch(0.723 0.192 149.6)",
  },
];

const CORE_KEYS = new Set(CORE_THEME_TOKENS.map((t) => t.key));

interface ThemeEditorProps {
  theme: Record<string, string>;
  onChange: (theme: Record<string, string>) => void;
  /** Hide the free-form custom-token rows (used in the guided wizard). */
  simple?: boolean;
}

export function ThemeEditor({ theme, onChange, simple = false }: ThemeEditorProps) {
  const customRows = useMemo(
    () => Object.entries(theme).filter(([key]) => !CORE_KEYS.has(key)),
    [theme],
  );

  function setToken(key: string, value: string) {
    onChange({ ...theme, [key]: value });
  }

  function removeToken(key: string) {
    const next = { ...theme };
    delete next[key];
    onChange(next);
  }

  function renameToken(oldKey: string, newKey: string) {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(theme)) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {CORE_THEME_TOKENS.map((token) => (
          <TokenField
            key={token.key}
            spec={token}
            value={theme[token.key] ?? ""}
            onChange={(v) => (v ? setToken(token.key, v) : removeToken(token.key))}
          />
        ))}
      </div>

      <ThemeSample theme={theme} />

      {simple ? null : (
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Custom tokens
          </p>
          <div className="mt-3 space-y-2">
            {customRows.map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <Input
                  value={key}
                  onChange={(e) => renameToken(key, e.target.value)}
                  aria-label="Token name"
                  className="max-w-52"
                />
                <Input
                  value={value}
                  onChange={(e) => setToken(key, e.target.value)}
                  aria-label={`Value for ${key}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeToken(key)}
                  aria-label={`Remove ${key}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setToken("--ring", "oklch(0.72 0.19 200)")}
            >
              <Plus className="mr-1 h-3 w-3" /> Add token
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenField({
  spec,
  value,
  onChange,
}: {
  spec: TokenSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  const swatch = oklchToHex(value || spec.fallback) ?? "#000000";
  const inherited = value.trim() === "";

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{spec.label}</span>
        <code className="text-[11px] text-muted-foreground">{spec.key}</code>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(hexToOklch(e.target.value))}
          aria-label={`${spec.label} color`}
          className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${spec.fallback} (inherited)`}
          aria-label={`${spec.label} token value`}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {spec.hint}
        {inherited ? " · using the base theme" : ""}
      </p>
      {value.trim() !== "" ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
          Reset to base
        </Button>
      ) : null}
    </div>
  );
}

function ThemeSample({ theme }: { theme: Record<string, string> }) {
  const style = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(theme)) if (v.trim()) vars[k] = v;
    return vars as React.CSSProperties;
  }, [theme]);

  return (
    <div
      style={{
        ...style,
        background: "var(--background)",
        color: "var(--foreground)",
        borderColor: "var(--border)",
      }}
      className="rounded-xl border p-4"
    >
      <p className="text-xs uppercase tracking-[0.14em] opacity-70">Preview</p>
      <div
        className="mt-3 rounded-lg border p-4"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <p className="text-sm font-medium">Sign in to continue</p>
        <p className="mt-1 text-xs opacity-70">Cards, text and buttons with these tokens.</p>
        <div className="mt-3 flex gap-2">
          <span
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: "var(--primary)", color: "var(--primary-foreground, #fff)" }}
          >
            Continue
          </span>
          <span
            className="rounded-md border px-3 py-2 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            Cancel
          </span>
          <span
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: "var(--accent)", color: "var(--background)" }}
          >
            Accent
          </span>
        </div>
      </div>
    </div>
  );
}
