import { readSession } from "../../_lib/auth";
import { noStoreJson } from "../../_lib/responses";
import type { BillingEnv } from "../../_lib/billing-env";

/**
 * Authenticated upload into the MyFenrir R2 media bucket (binding: MEDIA ->
 * myfenrir-media). Every object is namespaced per user as
 * `<frisky_user_id>/<kind>-<timestamp>.<ext>`, so a member can only ever write
 * inside their own prefix. R2 has no row-level policies, so this Worker is the
 * trust boundary: the owner id comes from the verified session cookie, never
 * from the client. Public read is served by /api/media/r2/<key>.
 *
 * Client usage (same-origin, carries the fenrir_session cookie):
 *   const fd = new FormData();
 *   fd.append("file", file);      // from <input type="file">
 *   fd.append("kind", "avatar");  // avatar | cover | upload
 *   const res = await fetch("/api/media/upload", {
 *     method: "POST", body: fd, credentials: "include",
 *   });
 *   const { url } = await res.json(); // -> "/api/media/r2/<uid>/avatar-....png"
 */

const ALLOWED_KINDS = new Set(["avatar", "cover", "upload"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB, mirrors the storage guardrail
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!context.env.MEDIA) {
    return noStoreJson({ ok: false, error: "media_not_configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return noStoreJson({ ok: false, error: "invalid_multipart_body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return noStoreJson({ ok: false, error: "file_required" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind = typeof kindRaw === "string" && ALLOWED_KINDS.has(kindRaw) ? kindRaw : "upload";

  const contentType = (file.type || "").toLowerCase();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return noStoreJson({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return noStoreJson({ ok: false, error: "file_too_large", limitBytes: MAX_BYTES }, { status: 413 });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return noStoreJson({ ok: false, error: "file_too_large", limitBytes: MAX_BYTES }, { status: 413 });
  }

  // Owner id is taken from the verified session, never the client, so nobody
  // can write outside their own <frisky_user_id>/ folder.
  const key = `${session.frisky_user_id}/${kind}-${Date.now()}.${ext}`;

  await context.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType },
  });

  return noStoreJson({ ok: true, key, url: `/api/media/r2/${key}` });
};
