#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(".");
const artifactsDir = join(root, "artifacts/bugbug/auth-walkthrough");
const chromeProfile = join(artifactsDir, "chrome-profile");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const appUrl = process.env.BUGBUG_LOCAL_BASE_URL || "http://127.0.0.1:5177";
const appPort = new URL(appUrl).port || "5177";
const cdpPort = Number(process.env.BUGBUG_CDP_PORT || "9224");
const distDir = join(root, "dist");
const tests = [];

await rm(artifactsDir, { recursive: true, force: true });
await mkdir(artifactsDir, { recursive: true });
await mkdir(chromeProfile, { recursive: true });

const preview = process.env.BUGBUG_REUSE_SERVER === "1" ? null : await startStaticServer(Number(appPort));
const browser = spawn(chrome, [
  "--headless=new",
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${chromeProfile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  `${appUrl}/`
], { stdio: ["ignore", "pipe", "pipe"] });

try {
  if (process.env.BUGBUG_REUSE_SERVER === "1" && /^https?:\/\//.test(appUrl)) {
    // Browser navigation is the real readiness check for remote deployments.
  } else {
    await waitForHttp(appUrl);
  }
  const cdp = await connectCdp(await waitForPageWebSocketUrl());
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  async function navigate(url) {
    await cdp.send("Page.navigate", { url });
    await sleep(900);
  }

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "runtime_evaluate_failed";
      throw new Error(details);
    }
    return result.result?.value;
  }

  async function currentUrl() {
    return evaluate("window.location.href");
  }

  async function waitForUrl(predicate, label, timeoutMs = 8000) {
    const started = Date.now();
    let lastUrl = "";
    while (Date.now() - started < timeoutMs) {
      lastUrl = await currentUrl();
      if (predicate(new URL(lastUrl))) return lastUrl;
      await sleep(150);
    }
    throw new Error(`${label}; last URL was ${lastUrl}`);
  }

  async function waitForExpression(expression, label, timeoutMs = 8000) {
    const started = Date.now();
    let lastValue = null;
    while (Date.now() - started < timeoutMs) {
      lastValue = await evaluate(expression);
      if (lastValue) return lastValue;
      await sleep(150);
    }
    throw new Error(`${label}; last value was ${JSON.stringify(lastValue)}`);
  }

  async function screenshot(name) {
    const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = join(artifactsDir, `${name}.png`);
    await writeFile(file, Buffer.from(result.data, "base64"));
    return file;
  }

  await step("front-door loads with Apple authorization action", async () => {
    await navigate("about:blank");
    await navigate(`${appUrl}/`);
    const hasAppleButton = await waitForExpression(`
      Boolean([...document.querySelectorAll("button")].find((button) => /Continue with Apple/i.test(button.textContent || "")))
    `, "Continue with Apple button not found", 15000);
    if (!hasAppleButton) throw new Error("Continue with Apple button not found");
    return {
      url: await currentUrl(),
      screenshot: await screenshot("01-front-door")
    };
  });

  await step("Apple authorization begins and uses Supabase callback broker", async () => {
    await navigate(`${appUrl}/`);
    await waitForExpression(`
      Boolean([...document.querySelectorAll("button")].find((button) => /Continue with Apple/i.test(button.textContent || "")))
    `, "Continue with Apple button not found before click");
    await evaluate(`
      [...document.querySelectorAll("button")]
        .find((button) => /Continue with Apple/i.test(button.textContent || ""))
        ?.click()
    `);
    const url = await waitForUrl(
      (next) => next.hostname.includes("appleid.apple.com") || next.hostname.includes("supabase.co"),
      "authorization did not leave MyFenrir"
    );
    const parsed = new URL(url);
    const redirectUri = parsed.searchParams.get("redirect_uri") || "";
    if (!parsed.hostname.includes("appleid.apple.com")) throw new Error(`expected Apple authorize URL, saw ${url}`);
    if (!decodeURIComponent(redirectUri).includes("/auth/v1/callback")) {
      throw new Error(`expected Supabase auth/v1 callback broker, saw redirect_uri=${redirectUri}`);
    }
    return {
      url,
      redirectUri: decodeURIComponent(redirectUri),
      screenshot: await screenshot("02-apple-authorization")
    };
  });

  await step("SPA callback route returns root login to /main", async () => {
    await navigate(`${appUrl}/`);
    await evaluate("window.localStorage.setItem('fenrir_post_auth_destination', '/main')");
    await navigate(`${appUrl}/auth/callback?error=access_denied&error_description=bugbug-spa-callback`);
    const url = await waitForUrl((next) => next.pathname === "/main", "SPA callback did not land on /main");
    return {
      url,
      screenshot: await screenshot("03-spa-callback-main")
    };
  });

  await step("production hash callback returns root login to /main", async () => {
    await navigate("about:blank");
    await navigate(`${appUrl}/#error=access_denied&error_description=bugbug-hash-callback`);
    const url = await waitForUrl((next) => next.pathname === "/main", "hash callback did not land on /main");
    return {
      url,
      screenshot: await screenshot("04-hash-callback-main")
    };
  });

  await step("callback preserves an in-app destination like /locks", async () => {
    await navigate(`${appUrl}/locks`);
    await evaluate("window.localStorage.setItem('fenrir_post_auth_destination', '/locks')");
    await navigate(`${appUrl}/auth/callback?error=access_denied&error_description=bugbug-locks-callback`);
    const url = await waitForUrl((next) => next.pathname === "/locks", "callback did not return to /locks");
    return {
      url,
      screenshot: await screenshot("05-callback-locks")
    };
  });

  await step("unsafe callback destination falls back to /main", async () => {
    await navigate(`${appUrl}/`);
    await evaluate("window.localStorage.setItem('fenrir_post_auth_destination', 'https://evil.example/path')");
    await navigate(`${appUrl}/auth/callback?error=access_denied&error_description=bugbug-unsafe-destination`);
    const url = await waitForUrl((next) => next.pathname === "/main", "unsafe destination did not fall back to /main");
    return {
      url,
      screenshot: await screenshot("06-unsafe-destination-main")
    };
  });

  cdp.close();
} finally {
  browser.kill("SIGTERM");
  if (preview) await new Promise((resolve) => preview.close(resolve));
}

const summary = {
  generatedAt: new Date().toISOString(),
  source: "bugbug-local-auth-walkthrough",
  baseUrl: appUrl,
  passed: tests.filter((test) => test.status === "passed").length,
  failed: tests.filter((test) => test.status === "failed").length,
  tests
};
await writeFile(join(artifactsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(join(artifactsDir, "fenrir-auth-walkthrough.junit.xml"), junit(summary));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed) process.exit(1);

async function step(name, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    tests.push({ name, status: "passed", durationMs: Date.now() - started, evidence });
  } catch (error) {
    tests.push({
      name,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function junit(summary) {
  const failures = summary.tests.filter((test) => test.status === "failed").length;
  const cases = summary.tests.map((test) => {
    const attrs = `classname="FenrirAuthWalkthrough" name="${escapeXml(test.name)}" time="${(test.durationMs / 1000).toFixed(3)}"`;
    if (test.status === "failed") {
      return `    <testcase ${attrs}>\n      <failure message="${escapeXml(test.error || "failed")}">${escapeXml(JSON.stringify(test, null, 2))}</failure>\n    </testcase>`;
    }
    return `    <testcase ${attrs}>\n      <system-out>${escapeXml(JSON.stringify(test.evidence, null, 2))}</system-out>\n    </testcase>`;
  }).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${summary.tests.length}" failures="${failures}">`,
    `  <testsuite name="Fenrir auth authorization and callback" tests="${summary.tests.length}" failures="${failures}">`,
    cases,
    "  </testsuite>",
    "</testsuites>",
    ""
  ].join("\n");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error(`preview_not_ready:${url}`);
}

async function startStaticServer(port) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" || !pathname.includes(".") ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = join(distDir, relativePath);
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store"
      });
      response.end(body);
    } catch {
      const body = await readFile(join(distDir, "index.html"));
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(body);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

function contentType(pathname) {
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

async function waitForPageWebSocketUrl() {
  const started = Date.now();
  let fallback = "";
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const json = await response.json();
      const appPage = json.find((target) => target.type === "page" && target.url?.startsWith(appUrl) && target.webSocketDebuggerUrl);
      if (appPage) return appPage.webSocketDebuggerUrl;
      const page = json.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) fallback = page.webSocketDebuggerUrl;
    } catch {
      await sleep(150);
    }
  }
  if (fallback) return fallback;
  throw new Error("chrome_debugger_not_ready");
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(JSON.stringify(message.error)));
    else callbacks.resolve(message.result ?? {});
  });

  return {
    send(method, params = {}) {
      const messageId = ++id;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(messageId);
          reject(new Error(`cdp_timeout:${method}`));
        }, 10000);
        pending.set(messageId, {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          }
        });
      });
    },
    close() {
      socket.close();
    }
  };
}
