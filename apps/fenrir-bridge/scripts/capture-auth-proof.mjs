import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'artifacts/auth-redirect-proof');
const chromeProfile = join(outDir, 'chrome-profile');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const appUrl = 'http://127.0.0.1:5177';
const port = 9223;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await mkdir(chromeProfile, { recursive: true });

const browser = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${chromeProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `${appUrl}/`,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

try {
  const wsUrl = await waitForPageWebSocketUrl();
  const cdp = await connectCdp(wsUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const frames = [];

  async function navigate(url) {
    await cdp.send('Page.navigate', { url });
    await sleep(900);
  }

  async function evaluate(expression) {
    return cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  }

  async function currentUrl() {
    const result = await evaluate('window.location.href');
    return result.result.value;
  }

  async function waitForPath(pathname, timeoutMs = 6000) {
    const started = Date.now();
    let lastUrl = '';
    while (Date.now() - started < timeoutMs) {
      lastUrl = await currentUrl();
      const url = new URL(lastUrl);
      if (url.pathname === pathname) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${pathname}; last URL was ${lastUrl}`);
  }

  async function capture(num, label, expected) {
    const url = await currentUrl();
    const result = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const file = join(outDir, `raw-${String(num).padStart(2, '0')}.png`);
    await writeFile(file, Buffer.from(result.data, 'base64'));
    frames.push({ num, file, label, expected, url });
  }

  await navigate(`${appUrl}/`);
  await capture(
    1,
    'Start at public MyFenrir root before login',
    'Old behavior felt like a loop back to this page.'
  );

  await evaluate("window.localStorage.setItem('fenrir_post_auth_destination', '/main')");
  await capture(2, 'Login intent saved from root', 'Expected callback destination: /main');

  await navigate(`${appUrl}/auth/callback?error=access_denied&error_description=proof`);
  await waitForPath('/main');
  await capture(
    3,
    'Callback processed after root login',
    'Proof: route is /main, not / and not /auth/callback.'
  );

  await navigate(`${appUrl}/`);
  await evaluate("window.localStorage.removeItem('fenrir_post_auth_destination')");
  await navigate('about:blank');
  await navigate(`${appUrl}/#error=access_denied&error_description=hash-proof`);
  await waitForPath('/main');
  await capture(
    4,
    'Production-style root hash callback processed',
    'Proof: /#access_token-style callbacks leave / and land on /main.'
  );

  await navigate(`${appUrl}/locks`);
  await evaluate("window.localStorage.setItem('fenrir_post_auth_destination', '/locks')");
  await capture(
    5,
    'Start from app route /locks before login',
    'Expected callback destination: /locks'
  );

  await navigate(`${appUrl}/auth/callback?error=access_denied&error_description=proof`);
  await waitForPath('/locks');
  await capture(
    6,
    'Callback processed after /locks login',
    'Proof: route is /locks, preserving the app route.'
  );

  await writeFile(join(outDir, 'frames.json'), JSON.stringify(frames, null, 2));
  console.log(JSON.stringify({ outDir, frames }, null, 2));
  cdp.close();
} finally {
  browser.kill('SIGTERM');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPageWebSocketUrl() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const json = await response.json();
      const page = json.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('chrome_debugger_not_ready');
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
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
      return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}
