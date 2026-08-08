/**
 * Sesión Supabase compartida entre las superficies *.myfenrir.com.
 *
 * Una sola sesión, un solo refresh token, guardado en una cookie de dominio
 * `.myfenrir.com`. Es lo que permite que quien ya entró en myfenrir.com llegue
 * autenticado a communities.myfenrir.com sin volver a firmar.
 *
 * Por qué cookie y no localStorage: localStorage está aislado por origen, así
 * que cada subdominio tendría su propia sesión. Y por qué UN solo almacén
 * compartido en vez de copiar el token de una app a otra: Supabase ROTA el
 * refresh token al usarlo, así que dos copias independientes se invalidan
 * entre sí y terminan expulsando al usuario.
 *
 * La cookie no es httpOnly porque el cliente Supabase corre en el navegador y
 * necesita leerla — la misma exposición que ya tenía localStorage, no una
 * regresión. Se limita a los subdominios propios de MyFenrir.
 */

const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // tope efectivo de los navegadores
const CHUNK_SIZE = 3000; // margen bajo el límite de ~4 KB por cookie

function isBrowser() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/** `.myfenrir.com` en producción; sin atributo en localhost/preview. */
function domainAttribute() {
  const host = window.location.hostname;
  if (host === "myfenrir.com" || host.endsWith(".myfenrir.com")) {
    return "; domain=.myfenrir.com";
  }
  return "";
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/${domainAttribute()}; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  document.cookie = `${encodeURIComponent(name)}=; path=/${domainAttribute()}; max-age=0; SameSite=Lax`;
}

/** Lee una cookie posiblemente troceada (`name.0`, `name.1`, …). */
function readChunked(name: string): string | null {
  const single = readCookie(name);
  if (single) return single;
  let out = "";
  for (let index = 0; ; index += 1) {
    const part = readCookie(`${name}.${index}`);
    if (part === null) break;
    out += part;
  }
  return out.length ? out : null;
}

function clearChunks(name: string) {
  deleteCookie(name);
  for (let index = 0; index < 12; index += 1) {
    if (readCookie(`${name}.${index}`) === null) break;
    deleteCookie(`${name}.${index}`);
  }
}

/**
 * Almacén de sesión para `createClient`. La cookie manda; localStorage se
 * mantiene como espejo para que un fallo al escribir la cookie no tire la
 * sesión, y como puente para las sesiones que ya existían antes de este
 * cambio (nadie tiene que volver a firmar por el despliegue).
 */
export const sharedSessionStorage = {
  getItem(key: string): string | null {
    if (!isBrowser()) return null;
    try {
      const fromCookie = readChunked(key);
      if (fromCookie) return fromCookie;
    } catch {
      // Cookies bloqueadas: seguimos con el espejo local.
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (!isBrowser()) return;
    try {
      clearChunks(key);
      if (value.length <= CHUNK_SIZE) {
        writeCookie(key, value);
      } else {
        for (let index = 0; index * CHUNK_SIZE < value.length; index += 1) {
          writeCookie(`${key}.${index}`, value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
        }
      }
    } catch {
      // Sin cookies solo se pierde el SSO entre subdominios, no la sesión.
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignorar cuotas/modo privado.
    }
  },

  removeItem(key: string): void {
    if (!isBrowser()) return;
    try {
      clearChunks(key);
    } catch {
      // Ignorar.
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignorar.
    }
  }
};

/**
 * Clave de almacenamiento compartida. Es la que Supabase usa por defecto para
 * este proyecto, así que las sesiones que ya vivían en localStorage se adoptan
 * tal cual.
 */
export function sharedStorageKey(supabaseUrl: string): string {
  const ref = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] ?? "auth";
  return `sb-${ref}-auth-token`;
}
