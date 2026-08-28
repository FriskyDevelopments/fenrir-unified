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
import { getSiteUrl } from "@/config/site-url";

interface GateShareProps {
  slug: string;
  /** Preset accent colour, used to tint the control surface. */
  accent: string;
  className?: string;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });

async function buildFenrirQr(url: string) {
  const { toDataURL } = await import("qrcode");
  const rawQr = await toDataURL(url, {
    width: 640,
    margin: 3,
    errorCorrectionLevel: "H",
    color: { dark: "#123A86", light: "#F2F7FF" },
  });

  // El QR es lo único imprescindible. La marca central es decoración y NO debe
  // poder tumbar el compartir: en producción `/fenrir-mark.svg` responde 302
  // hacia frisky.cloudflareaccess.com (Cloudflare Access intercepta los
  // estáticos de la raíz), así que `loadImage` recibía un documento HTML,
  // disparaba `onerror`, rechazaba toda la promesa y el usuario sólo veía
  // "Could not build the QR code." — un QR perfectamente válido tirado a la
  // basura por un logotipo. Ahora la marca es opcional.
  const qr = await loadImage(rawQr);
  const mark = await loadImage("/fenrir-mark.svg").catch(() => null);
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  const frame = context.createLinearGradient(0, 0, 720, 720);
  frame.addColorStop(0, "#168BFF");
  frame.addColorStop(0.52, "#614BFF");
  frame.addColorStop(1, "#A855F7");
  context.fillStyle = frame;
  context.fillRect(0, 0, 720, 720);
  context.fillStyle = "#07111F";
  context.fillRect(12, 12, 696, 696);
  context.drawImage(qr, 40, 40, 640, 640);

  // Keep the mark compact and use high error correction so branded PNGs remain robust.
  if (mark) {
    const plateSize = 88;
    const plateX = (720 - plateSize) / 2;
    const plateY = (720 - plateSize) / 2;
    context.fillStyle = "#07111F";
    context.beginPath();
    // `roundRect` no existe antes de Safari 16.4: sin este guardia el catch de
    // arriba convertía un navegador algo viejo en "no pude construir el QR".
    if (typeof context.roundRect === "function") {
      context.roundRect(plateX, plateY, plateSize, plateSize, 24);
    } else {
      context.rect(plateX, plateY, plateSize, plateSize);
    }
    context.fill();
    context.strokeStyle = "#8B5CF6";
    context.lineWidth = 5;
    context.stroke();
    context.drawImage(mark, plateX + 10, plateY + 10, plateSize - 20, plateSize - 20);
  }

  return canvas.toDataURL("image/png");
}

/** Share controls for a public gate: copy the link, or show a scannable QR code. */
export function GateShare({ slug, accent, className }: GateShareProps) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${getSiteUrl()}/g/${encodeURIComponent(slug)}`);
    setQrDataUrl(null);
  }, [slug]);

  useEffect(() => {
    if (!qrOpen || !url || qrDataUrl) return;
    let active = true;
    void (async () => {
      try {
        const png = await buildFenrirQr(url);
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
        <DialogContent className="overflow-hidden border-violet-400/25 bg-[#07111f] text-white shadow-[0_0_80px_rgba(99,102,241,0.28)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to open this gate</DialogTitle>
            <DialogDescription className="break-all">{url}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-[1.4rem] border border-violet-300/30 bg-[#07111f] p-2 shadow-[0_0_42px_rgba(22,139,255,0.25)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code linking to the ${slug} MyFenrir gate`}
                  className="h-full w-full rounded-2xl object-contain"
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
