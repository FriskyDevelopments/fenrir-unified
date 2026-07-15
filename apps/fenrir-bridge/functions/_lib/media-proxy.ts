type MediaProxyEnv = {
  SESSION_SECRET?: string;
  MEDIA_PROXY_ALLOWED_HOSTS?: string;
};

const maxImageBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export async function signedMediaProxyPath(rawUrl: string, env: MediaProxyEnv) {
  const target = normalizeRemoteImageUrl(rawUrl, env);
  if (!target) return '';
  const encoded = base64Url(new TextEncoder().encode(target));
  const signature = await hmac(requireSecret(env.SESSION_SECRET), encoded);
  return `/api/media/proxy?u=${encodeURIComponent(encoded)}&sig=${encodeURIComponent(signature)}`;
}

export async function verifyMediaProxyRequest(request: Request, env: MediaProxyEnv) {
  const url = new URL(request.url);
  const encoded = url.searchParams.get('u') ?? '';
  const signature = url.searchParams.get('sig') ?? '';
  if (!encoded || !signature) return null;

  const expected = await hmac(requireSecret(env.SESSION_SECRET), encoded);
  if (!timingSafeEqual(signature, expected)) return null;

  const decoded = new TextDecoder().decode(base64UrlToBytes(encoded));
  return normalizeRemoteImageUrl(decoded, env);
}

export async function fetchProxiedImage(target: string) {
  const response = await fetch(target, {
    redirect: 'manual',
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8',
    },
  });
  if (!response.ok) {
    return Response.json({ ok: false, error: 'image_fetch_failed' }, { status: 502 });
  }

  const contentType = cleanContentType(response.headers.get('Content-Type'));
  if (!allowedImageTypes.has(contentType)) {
    return Response.json({ ok: false, error: 'unsupported_image_type' }, { status: 415 });
  }

  const contentLength = Number(response.headers.get('Content-Length') ?? '0');
  if (contentLength > maxImageBytes) {
    return Response.json({ ok: false, error: 'image_too_large' }, { status: 413 });
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxImageBytes) {
    return Response.json({ ok: false, error: 'image_too_large' }, { status: 413 });
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeRemoteImageUrl(value: string, env: MediaProxyEnv) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return '';
    if (isBlockedHostname(url.hostname)) return '';
    if (!isAllowedMediaHost(url.hostname, env)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function isAllowedMediaHost(hostname: string, env: MediaProxyEnv) {
  const allowed = (env.MEDIA_PROXY_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return false;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function cleanContentType(value: string | null) {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}

function requireSecret(value: string | undefined) {
  if (!value) throw new Error('missing_env:SESSION_SECRET');
  return value;
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}
