import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASPECT_PRESETS, ImageCropDialog } from "@/components/brand/image-crop-dialog";

const BUCKET = "brand-assets";

interface BrandAssetUploadProps {
  label: string;
  brandId: string;
  kind: "mark" | "wordmark";
  value: string | null;
  onChange: (value: string | null) => void;
}

/**
 * Uploads a brand image into the private `brand-assets` bucket and stores the
 * public read path (`/brand-asset/...`). Falls back to typing any https URL.
 */
export function BrandAssetUpload({
  label,
  brandId,
  kind,
  value,
  onChange,
}: BrandAssetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);


  async function upload(file: File) {
    setError(null);
    if (!brandId) {
      setError("Set the brand id first.");
      return;
    }
    if (!/^image\/(png|jpeg|webp|svg\+xml|avif)$/.test(file.type)) {
      setError("Use a PNG, JPEG, WEBP, AVIF or SVG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Keep the file under 2 MB.");
      return;
    }

    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${brandId}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    setBusy(false);

    if (uploadError) {
      setError(
        /row-level security|Unauthorized|permission/i.test(uploadError.message)
          ? "Only staff can upload brand assets."
          : uploadError.message,
      );
      return;
    }
    onChange(`/brand-asset/${path}`);
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-card/50">
          {value ? (
            <img src={value} alt={`${label} preview`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              none
            </span>
          )}
        </div>
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.trim() === "" ? null : e.target.value)}
          placeholder="Upload a file or paste an https:// URL"
          aria-label={`${label} URL`}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">Upload</span>
        </Button>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange(null)} aria-label={`Clear ${label}`}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          if (file.type === "image/svg+xml") {
            void upload(file);
          } else {
            setPending(file);
          }
        }}
      />
      <ImageCropDialog
        open={pending !== null}
        file={pending}
        kind={kind}
        onCancel={() => setPending(null)}
        onConfirm={async (cropped) => {
          setPending(null);
          await upload(cropped);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Recommended: {ASPECT_PRESETS[kind].map((p) => p.label).join(" · ")}. Raster uploads open a
        cropper; SVGs upload as-is. No image? The app falls back to the brand initials.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

    </div>
  );
}
