export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const suffix = url.pathname.substring("/activation/security".length);
  const targetPath = suffix === "" || suffix === "/" ? "/activation" : suffix;
  const targetUrl = new URL(targetPath + url.search, "https://cyberpup-security-5nznlsxd7a-uc.a.run.app");

  const response = await fetch(new Request(targetUrl.toString(), context.request));

  // Clone response to modify headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://telegram.org https://oauth.telegram.org https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://esm.run https://*.esm.run; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; object-src 'none'; connect-src 'self' https://yqevglppbhuoxxfsfnih.supabase.co https://cloudflareinsights.com https://*.supabase.co https://*.telegram.org; frame-src https://oauth.telegram.org https://telegram.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
  );

  return newResponse;
}
