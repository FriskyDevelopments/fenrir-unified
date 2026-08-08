import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, QrCode } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface GateShareProps {
  slug: string;
  /** Preset accent colour, used to tint the control surface. */
  accent: string;
  className?: string;
}

/** Share controls for a public gate: copy the link, or show a scannable QR code. */
export function GateShare({ slug, accent, className }: GateShareProps) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/g/${slug}`);
  }, [slug]);

  useEffect(() => {
    if (!qrOpen || !url || qrDataUrl) return;
    let active = true;
    void (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const png = await toDataURL(url, {
          width: 640,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#070b12", light: "#ffffff" },
        });
        if (active) setQrDataUrl(png);
      } catch {
        if (active) toast.error("Could not build the QR code.");
      }
    })();
    return () => {
      active = false;
    };
  }, [qrOpen, url, qrDataUrl]);

  const onCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Gate link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select and copy the link manually.");
    }
  }, [url]);

  const surface = {
    background: `color-mix(in oklab, ${accent} 12%, transparent)`,
  } as const;

  const buttonClass =
    "pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/70 backdrop-blur transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      <button type="button" onClick={onCopy} className={buttonClass} style={surface}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogTrigger asChild>
          <button type="button" className={buttonClass} style={surface} aria-label="Show QR code">
            <QrCode className="h-3.5 w-3.5" />
            QR code
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to open this gate</DialogTitle>
            <DialogDescription className="break-all">{url}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-white p-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code linking to the ${slug} MyFenrir gate`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">Generating…</span>
              )}
            </div>
            {qrDataUrl ? (
              <a
                href={qrDataUrl}
                download={`myfenrir-gate-${slug}.png`}
                className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Download PNG
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
