import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crop, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface AspectPreset {
  id: string;
  label: string;
  hint: string;
  ratio: number;
}

/** Recommended framings so uploads sit correctly in the login card and console. */
export const ASPECT_PRESETS: Record<"mark" | "wordmark", AspectPreset[]> = {
  mark: [
    { id: "1:1", label: "Square 1:1", hint: "Badges, avatars, favicons", ratio: 1 },
    { id: "4:3", label: "Landscape 4:3", hint: "Wider emblem marks", ratio: 4 / 3 },
  ],
  wordmark: [
    { id: "4:1", label: "Banner 4:1", hint: "Login header lockup", ratio: 4 },
    { id: "3:1", label: "Wide 3:1", hint: "Console sidebar lockup", ratio: 3 },
    { id: "2:1", label: "Compact 2:1", hint: "Stacked lockups", ratio: 2 },
  ],
};

const FRAME_WIDTH = 360;

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  kind: "mark" | "wordmark";
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
}

export function ImageCropDialog({ open, file, kind, onCancel, onConfirm }: ImageCropDialogProps) {
  const presets = ASPECT_PRESETS[kind];
  const [presetId, setPresetId] = useState(presets[0].id);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const ratio = presets.find((p) => p.id === presetId)?.ratio ?? 1;
  const frameHeight = FRAME_WIDTH / ratio;

  useEffect(() => {
    setPresetId(presets[0].id);
  }, [kind, presets]);

  useEffect(() => {
    if (!file) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const layout = useMemo(() => {
    if (!image) return null;
    const base = Math.max(FRAME_WIDTH / image.width, frameHeight / image.height);
    const scale = base * zoom;
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const maxX = Math.max(0, (drawW - FRAME_WIDTH) / 2);
    const maxY = Math.max(0, (drawH - frameHeight) / 2);
    const x = Math.min(maxX, Math.max(-maxX, offset.x));
    const y = Math.min(maxY, Math.max(-maxY, offset.y));
    return { drawW, drawH, x, y };
  }, [image, frameHeight, zoom, offset]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    },
    [offset],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({ x: drag.ox + (e.clientX - drag.x), y: drag.oy + (e.clientY - drag.y) });
  }, []);

  async function confirm() {
    if (!image || !layout || !file) return;
    setBusy(true);
    try {
      const dpr = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(FRAME_WIDTH * dpr);
      canvas.height = Math.round(frameHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.imageSmoothingQuality = "high";
      const left = (FRAME_WIDTH - layout.drawW) / 2 + layout.x;
      const top = (frameHeight - layout.drawH) / 2 + layout.y;
      ctx.drawImage(image, left * dpr, top * dpr, layout.drawW * dpr, layout.drawH * dpr);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.95),
      );
      if (!blob) throw new Error("Could not render the crop");
      const name = file.name.replace(/\.[^.]+$/, "");
      await onConfirm(
        new File([blob], `${name}-${presetId.replace(":", "x")}.png`, { type: "image/png" }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-4 w-4" />
            Crop {kind === "mark" ? "logo mark" : "wordmark"}
          </DialogTitle>
          <DialogDescription>
            Pick a recommended aspect ratio, then drag and zoom so the artwork fills the frame.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setPresetId(preset.id);
                setOffset({ x: 0, y: 0 });
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                preset.id === presetId
                  ? "border-primary bg-primary/10"
                  : "border-border/60 hover:border-border",
              )}
            >
              <span className="block text-xs font-medium">{preset.label}</span>
              <span className="block text-[11px] text-muted-foreground">{preset.hint}</span>
            </button>
          ))}
        </div>

        <div
          className="relative mx-auto overflow-hidden rounded-lg border border-border/60 bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%),linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] touch-none"
          style={{ width: FRAME_WIDTH, height: frameHeight }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
        >
          {image && layout ? (
            <img
              src={image.src}
              alt="Crop preview"
              draggable={false}
              className="absolute left-1/2 top-1/2 select-none"
              style={{
                width: layout.drawW,
                height: layout.drawH,
                transform: `translate(calc(-50% + ${layout.x}px), calc(-50% + ${layout.y}px))`,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading image…
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Zoom
          </label>
          <Slider
            value={[zoom]}
            min={1}
            max={4}
            step={0.01}
            onValueChange={([next]) => setZoom(next)}
            aria-label="Zoom"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || !image}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Crop &amp; upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
