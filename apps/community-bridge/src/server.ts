import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { GATE_UNAVAILABLE_HEADER } from "./lib/gate-availability";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * "No pude comprobar" debe salir como 503, no como 200 ni como 500.
 *
 * El render del documento fija el status y pisa cualquier `setResponseStatus`
 * hecho más adentro (medido: 200 al devolver del loader, 500 al lanzar). Las
 * cabeceras sí sobreviven, así que el camino del Gate marca la respuesta y
 * aquí —el último punto antes de salir a la red— la convertimos en un 503 de
 * verdad. Sin esto el monitoreo ve "todo bien" con Neon caído.
 */
function applyUnavailableStatus(response: Response): Response {
  if (response.headers.get(GATE_UNAVAILABLE_HEADER) !== "1") return response;
  const headers = new Headers(response.headers);
  headers.delete(GATE_UNAVAILABLE_HEADER);
  // Una página de error cacheada es peor que un status equivocado.
  headers.set("cache-control", "no-store");
  if (!headers.has("retry-after")) headers.set("retry-after", "30");
  return new Response(response.body, {
    status: 503,
    statusText: "Gate directory unavailable",
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applyUnavailableStatus(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
