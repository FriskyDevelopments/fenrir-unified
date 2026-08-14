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
  /** Gate-specific copy makes the QR share card recognizably this Gate. */
  title: string;
  /** Preset accent colour, used to tint the control surface. */
  accent: string;
  /** Preset atmosphere is decorative only; the QR itself stays high contrast. */
  atmosphere: string;
  className?: string;
}

/** Share controls for a public gate: copy the link, or show a scannable QR code. */
export function GateShare({ slug, title, accent, atmosphere, className }: GateShareProps) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);

  useEffect(() => {
    // A community invite is a Telegram-native entry point.  The Quality bot
    // receives this Gate slug and presents a Telegram Web App button for the
    // same Gate; it is deliberately not a generic web landing page.
    const bot = import.meta.env["VITE_TELEGRAM_BOT_USERNAME"]?.trim() || "MyfenrirprotocolDEVbot";
    setUrl(`https://t.me/${bot}?start=gate_${encodeURIComponent(slug)}`);
    setQrDataUrl(null);
    setShareCardUrl(null);
  }, [slug]);

  useEffect(() => {
    if (!qrOpen || !url || qrDataUrl) return;
    let active = true;
    void (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const png = await toDataURL(url, {
          width: 900,
          margin: 2,
          errorCorrectionLevel: "H",
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

  useEffect(() => {
    if (!qrDataUrl || shareCardUrl) return;
    let active = true;
    const source = new Image();
    source.onload = () => {
      if (!active) return;
      const canvas = document.createElement("canvas");
      canvas.width = 1400;
      canvas.height = 1800;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const background = ctx.createLinearGradient(0, 0, 1400, 1800);
      background.addColorStop(0, "#080b14");
      background.addColorStop(0.55, "#141a2a");
      background.addColorStop(1, "#06070d");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const glow = ctx.createRadialGradient(700, 740, 20, 700, 740, 790);
      glow.addColorStop(0, accent);
      glow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.roundRect(170, 390, 1060, 1060, 56);
      ctx.fill();
      ctx.drawImage(source, 225, 445, 950, 950);
      ctx.fillStyle = accent;
      ctx.font = "700 30px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText("MYFENRIR COMMUNITY GATE", 700, 180);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 66px ui-sans-serif, system-ui, sans-serif";
      const words = title.toUpperCase().slice(0, 38);
      ctx.fillText(words, 700, 270);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 31px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("Scan to enter this private community", 700, 1530);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 32px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(`@${slug}`, 700, 1610);
      ctx.font = "500 22px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(url.replace(/^https:\/\//, ""), 700, 1670);
      setShareCardUrl(canvas.toDataURL("image/png"));
    };
    source.src = qrDataUrl;
    return () => {
      active = false;
    };
  }, [accent, qrDataUrl, shareCardUrl, slug, title, url]);

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
        <DialogContent className="overflow-hidden p-0 sm:max-w-sm">
          <div className="absolute inset-0 -z-10 opacity-70" style={{ background: atmosphere }} />
          <DialogHeader>
            <div className="p-6 pb-0">
              <DialogTitle>Open {title}</DialogTitle>
              <DialogDescription className="mt-1 break-all">{url}</DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 p-6 pt-4">
            <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-white p-3 shadow-2xl" style={{ boxShadow: `0 0 44px -12px ${accent}` }}>
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
            {shareCardUrl ? (
              <a
                href={shareCardUrl}
                download={`myfenrir-${slug}-invite.png`}
                className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Download invite card
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
