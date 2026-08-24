import { useRef, useState } from "react";
import { Film, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { verifyUploadedImage } from "@/lib/moderation.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GATE_MEDIA_ACCEPT,
  GATE_MEDIA_MAX_BYTES,
  GATE_MEDIA_TYPE_PATTERN,
  isUsableMediaUrl,
  isVideoUrl,
} from "@/lib/gate-presets";
import { cn } from "@/lib/utils";

const BUCKET = "gate-media";

interface GateMediaFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

/**
 * Drop-or-pick uploader for gate artwork. Accepts PNG/JPEG/WEBP/AVIF/SVG, GIF
 * and short MP4/WEBM/MOV loops, stores them in the private `gate-media` bucket
 * and keeps the public read path (`/gate-media/...`) in the config. Pasting an
 * `https://` URL still works for already-hosted files.
 */
export function GateMediaField({ id, label, hint, value, onChange }: GateMediaFieldProps) {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifyImage = useServerFn(verifyUploadedImage);

  const invalidUrl = Boolean(value) && !isUsableMediaUrl(value!);
  const isVideo = isVideoUrl(value);

  async function upload(file: File) {
    setError(null);
    const userId = session?.user.id;
    if (!userId) {
      setError("Sign in again to upload files.");
      return;
    }
    if (!GATE_MEDIA_TYPE_PATTERN.test(file.type)) {
      setError("Use a PNG, JPEG, WEBP, GIF, MP4, WEBM or MOV file.");
      return;
    }
    const limit = file.type.startsWith("video/")
      ? GATE_MEDIA_MAX_BYTES.video
      : GATE_MEDIA_MAX_BYTES.image;
    if (file.size > limit) {
      setError(
        `Keep ${file.type.startsWith("video/") ? "videos" : "images"} under ${Math.round(limit / (1024 * 1024))} MB.`,
      );
      return;
    }

    setBusy(true);
    const ext =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${userId}/${id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setBusy(false);
      setError(
        /row-level security|Unauthorized|permission/i.test(uploadError.message)
          ? "Sign in again — the upload was not allowed."
          : uploadError.message,
      );
      return;
    }

    const publicPath = `/gate-media/${path}`;
    onChange(publicPath);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`gate-media-${id}`}>{label}</Label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-dashed p-3 transition",
          dragging ? "border-ring bg-accent/40" : "border-border",
        )}
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-card/50">
          {value && !invalidUrl ? (
            isVideo ? (
              <video
                src={value!}
                className="h-full w-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img src={value!} alt="" className="h-full w-full object-contain" />
            )
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Drag &amp; drop a file here, or{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              onClick={() => inputRef.current?.click()}
            >
              browse
            </button>
            . {hint}
          </p>
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Film className="h-3 w-3" /> PNG · JPG · WEBP · SVG · GIF · MP4 · WEBM
          </p>
        </div>

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
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <Input
        id={`gate-media-${id}`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.trim() === "" ? null : e.target.value)}
        placeholder="…or paste a public https:// URL"
        inputMode="url"
        aria-invalid={invalidUrl}
      />
      {invalidUrl ? (
        <p className="text-[11px] text-destructive">
          Use an uploaded file or a public https:// URL.
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={GATE_MEDIA_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
