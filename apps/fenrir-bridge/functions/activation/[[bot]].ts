// Proxy /activation/security and /activation/core to their Cloud Run services.
// Also proxy sub-resources (assets, etc.) that the activation portal references.

const botMap: Record<string, string> = {
  security: "https://cyberpup-security-411033642222.us-central1.run.app",
  core: "https://cyberpup-core-411033642222.us-central1.run.app"
};

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // segments: ["activation", "security"] or ["activation", "core"]
  const bot = segments[1]?.toLowerCase();
  const upstream = bot ? botMap[bot] : undefined;

  if (!upstream) {
    return context.next();
  }

  // Proxy the full path to Cloud Run (e.g. /activation/security → /activation)
  const targetUrl = new URL("/activation", upstream);
  targetUrl.search = url.search;
  // Preserve hash in redirect if present
  
  const headers = new Headers(context.request.headers);
  headers.delete("host");

  const response = await fetch(targetUrl.toString(), {
    method: context.request.method,
    headers,
    body: context.request.body,
    redirect: "follow"
  });

  // Rewrite the HTML to fix asset paths: /assets/... → Cloud Run /assets/...
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    let html = await response.text();
    // Rewrite root-relative asset paths to point to Cloud Run
    html = html.replace(/src="\/assets\//g, `src="${upstream}/assets/`);
    html = html.replace(/href="\/assets\//g, `href="${upstream}/assets/`);
    
    const newHeaders = new Headers(response.headers);
    newHeaders.delete("content-length");
    newHeaders.delete("content-encoding");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};
