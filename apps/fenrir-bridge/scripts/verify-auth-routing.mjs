// Public routing checks: no account credentials, link codes, or identity writes.
const hosts = (process.env.FENRIR_VERIFY_HOSTS || "https://myfenrir.com,https://www.myfenrir.com").split(",");
let failures = 0;
for (const host of hosts) {
  const base = host.trim().replace(/\/+$/, "");
  for (const path of ["/auth/callback", "/auth/v1/callback"]) {
    for (const query of ["", "?auth_route_probe=1"]) {
      try {
        const response = await fetch(`${base}${path}${query}`, { signal: AbortSignal.timeout(15_000) });
        const body = await response.text();
        if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html") || !body.includes('<div id="root">')) {
          throw new Error(`expected SPA HTML, received HTTP ${response.status}`);
        }
        console.log(`OK ${base}${path}${query} reaches the application`);
      } catch (error) {
        failures++;
        console.error(`FAIL ${base}${path}${query}: ${error.message}`);
      }
    }
  }
  try {
    const response = await fetch(`${base}/api/telegram/link/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    if (response.status !== 401 || body.error !== "invalid_signature") {
      throw new Error(`expected protected confirmation endpoint, received HTTP ${response.status}`);
    }
    console.log(`OK ${base}/api/telegram/link/confirm reaches its signature guard`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${base}/api/telegram/link/confirm: ${error.message}`);
  }
}
process.exitCode = failures ? 1 : 0;
