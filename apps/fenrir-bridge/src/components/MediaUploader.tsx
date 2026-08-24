import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { mediaService, type MediaKind } from "../services/api";

/** Mirrors the server guardrails in functions/api/media/upload.ts. */
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB
const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/gif,image/avif";

type Shape = "circle" | "square" | "wide";

type MediaUploaderProps = {
  /** avatar | cover | upload — sent to the server and used to key the object. */
  kind: MediaKind;
  /** Current image URL (e.g. a previously uploaded `/api/media/r2/<key>`), or null. */
  value?: string | null;
  /** Fires on a successful upload, and with null when the field is cleared. */
  onChange: (result: { url: string; key: string } | null) => void;
  label?: string;
  hint?: string;
  className?: string;
  /** Preview shape. Defaults to circle for avatars, wide for covers. */
  shape?: Shape;
  disabled?: boolean;
};

const previewClassByShape: Record<Shape, string> = {
  circle: "h-20 w-20 rounded-full",
  square: "h-20 w-20 rounded-lg",
  wide: "aspect-[3/1] w-full rounded-lg"
};

/**
 * Avatar / cover picker for MyFenrir. Validates the file client-side (same image
 * types and 10 MiB limit the Worker enforces), uploads it to R2 through
 * `mediaService.upload`, and hands back the same-origin read URL.
 *
 * Clearing only drops the reference in the form — it does not delete the R2
 * object (there is no delete endpoint yet; add one if hard-delete is needed).
 *
 * Usage:
 *   const [avatar, setAvatar] = useState<string | null>(null);
 *   <MediaUploader kind="avatar" value={avatar}
 *     onChange={(r) => setAvatar(r?.url ?? null)} label="Profile photo" />
 */
export function MediaUploader({
  kind,
  value = null,
  onChange,
  label,
  hint,
  className = "",
  shape,
  disabled = false
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedShape: Shape = shape ?? (kind === "cover" ? "wide" : "circle");

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Use a JPEG, PNG, WEBP, GIF or AVIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Keep the image under ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`);
      return;
    }

    setBusy(true);
    try {
      const result = await mediaService.upload(file, kind);
      onChange({ url: result.url, key: result.key });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "media_upload_failed";
      setError(
        /authentication_required|401/.test(message)
          ? "Sign in again to upload."
          : /unsupported_media_type|415/.test(message)
            ? "That image type is not supported."
            : /file_too_large|413/.test(message)
              ? "That image is too large."
              : "Upload failed. Try again in a moment."
      );
    } finally {
      setBusy(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so picking the same file again still fires a change.
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-center gap-3 rounded-xl border border-dashed p-3 transition ${
          dragging ? "border-white/60 bg-white/5" : "border-white/15"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <div className="flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/5">
          <div className={`flex items-center justify-center overflow-hidden ${previewClassByShape[resolvedShape]}`}>
            {value ? (
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="px-2 text-center text-[11px] leading-tight text-white/40">
                {resolvedShape === "wide" ? "No cover yet" : "No image"}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {hint ? <p className="text-[11px] leading-snug text-white/50">{hint}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled || busy}
              aria-busy={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Uploading…" : value ? "Replace" : "Upload"}
            </button>
            {value ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => {
                  setError(null);
                  onChange(null);
                }}
                className="rounded-lg px-2 py-1.5 text-sm text-white/60 transition hover:text-white disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
          </div>
          {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
        </div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        disabled={disabled || busy}
        onChange={onInputChange}
      />
    </div>
  );
}

export default MediaUploader;
