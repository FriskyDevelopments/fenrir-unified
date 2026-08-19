// frisky-qa-runner — Playwright E2E for the MyFenrir Quality auth flow.
//
// Boundaries & safety:
//   - Quality-only URLs. NEVER point this at myfenrir.com / communities.myfenrir.com / payments.
//   - The test identity is read ONLY from the Apify Secret env var QA_SUPABASE_ACCESS_TOKEN
//     (a short-lived, quality-only Supabase access token). It is never printed or stored.
//   - Cookies / Authorization / token-like fields are redacted from every captured artifact.
//   - No payments, invoices, or destructive actions are exercised.
//
// Runs on Apify (Actor) and locally (`node main.js` with local storage).

import { Actor } from 'apify';
import { chromium } from 'playwright';

const REDACT = /(authorization|cookie|set-cookie|token|apikey|api-key|bearer|refresh|access_token|password)/i;
const redactHeaders = (headers = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(headers)) out[k] = REDACT.test(k) ? '<redacted>' : v;
    return out;
};
const redactUrl = (u = '') => u.replace(/([?&](access_token|token|apikey|api-key|code|refresh_token)=)[^&#]*/gi, '$1<redacted>');

await Actor.init();

const input = (await Actor.getInput()) || {};
const baseUrl = (input.baseUrl || 'https://quality.myfenrir.com').replace(/\/$/, '');
const communityUrl = (input.communityUrl || 'https://communities-quality.myfenrir.com').replace(/\/$/, '');
const communityGatePath = input.communityGatePath || '/gate?onboarding=1';
const runAuthenticated = input.runAuthenticated !== false;
const viewports = Array.isArray(input.viewports) && input.viewports.length
    ? input.viewports
    : [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }];

// Hard guard: refuse to run against any production host.
const PROD_HOSTS = ['myfenrir.com', 'www.myfenrir.com', 'communities.myfenrir.com', 'community.myfenrir.com', 'auth.myfenrir.com'];
for (const u of [baseUrl, communityUrl]) {
    try {
        const h = new URL(u).hostname;
        if (PROD_HOSTS.includes(h)) throw new Error(`refusing_prod_host:${h}`);
    } catch (e) { if (String(e.message).startsWith('refusing_prod_host')) throw e; }
}

const accessToken = process.env.QA_SUPABASE_ACCESS_TOKEN || null;
const kvs = await Actor.openKeyValueStore();
const report = {
    startedAt: new Date().toISOString(),
    baseUrl, communityUrl, communityGatePath, runAuthenticated,
    tokenPresent: Boolean(accessToken),
    legs: [], screenshots: [], verdict: 'pending', notes: [],
};

const shot = async (page, name) => {
    const key = `${name}.png`.replace(/[^a-z0-9._-]/gi, '_');
    const buf = await page.screenshot({ fullPage: true }).catch(() => null);
    if (buf) { await kvs.setValue(key, buf, { contentType: 'image/png' }); report.screenshots.push(key); }
    return key;
};

const wireCapture = (page, bag) => {
    page.on('console', (m) => bag.console.push({ type: m.type(), text: m.text().slice(0, 500) }));
    page.on('requestfailed', (r) => bag.failed.push({ url: redactUrl(r.url()), method: r.method(), error: r.failure()?.errorText }));
    page.on('response', (r) => { if (r.status() >= 400) bag.badStatus.push({ url: redactUrl(r.url()), status: r.status() }); });
};

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

for (const vp of viewports) {
    const leg = { viewport: vp.name, steps: [], console: [], failed: [], badStatus: [], verdict: 'pending' };
    const bag = { console: leg.console, failed: leg.failed, badStatus: leg.badStatus };
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    wireCapture(page, bag);
    try {
        // 1) Landing correctness (canonical Fenrir silhouette, no wrong /docs route).
        const resp = await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        const finalUrl = redactUrl(page.url());
        const title = await page.title().catch(() => '');
        const hasSilhouette = await page.locator('svg[aria-label="Fenrir silhouette"]').count().catch(() => 0);
        const hasRoot = await page.locator('#root').count().catch(() => 0);
        const wrongDocs = /\/docs(\/|$)/.test(new URL(page.url()).pathname);
        await shot(page, `${vp.name}-01-landing`);
        leg.steps.push({ step: 'landing', status: resp?.status(), finalUrl, title, hasSilhouette: Number(hasSilhouette) > 0, hasRoot: Number(hasRoot) > 0, wrongDocsRoute: wrongDocs });

        // 2) Unauthenticated /api/auth/me
        const meAnon = await page.request.get(baseUrl + '/api/auth/me', { headers: { accept: 'application/json' } });
        const meAnonBody = await meAnon.json().catch(() => ({}));
        leg.steps.push({ step: 'me_anon', status: meAnon.status(), authenticated: meAnonBody.authenticated ?? null });

        // 3) Authenticated legs — only with a secret token.
        if (runAuthenticated && accessToken) {
            const sess = await page.request.post(baseUrl + '/api/auth/supabase-session', {
                headers: { 'content-type': 'application/json' },
                data: { accessToken },
            });
            leg.steps.push({ step: 'establish_session', status: sess.status(), ok: sess.ok() });

            await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
            const meAuth = await page.request.get(baseUrl + '/api/auth/me', { headers: { accept: 'application/json' } });
            const meAuthBody = await meAuth.json().catch(() => ({}));
            leg.steps.push({ step: 'me_authed', status: meAuth.status(), authenticated: meAuthBody.authenticated ?? null, callbackStayedOnQualityHost: new URL(page.url()).hostname === new URL(baseUrl).hostname });
            await shot(page, `${vp.name}-02-authed-landing`);

            // 4) Handoff → Community Bridge Quality
            try {
                const cResp = await page.goto(communityUrl + communityGatePath, { waitUntil: 'domcontentloaded', timeout: 45000 });
                const cme = await page.request.get(communityUrl + '/api/auth/me', { headers: { accept: 'application/json' } }).catch(() => null);
                const cmeBody = cme ? await cme.json().catch(() => ({})) : {};
                await shot(page, `${vp.name}-03-community-gate`);
                leg.steps.push({ step: 'community_handoff', status: cResp?.status(), finalUrl: redactUrl(page.url()), proxiedMeAuthenticated: cmeBody.authenticated ?? null });
            } catch (e) {
                leg.steps.push({ step: 'community_handoff', verdict: 'blocked', error: String(e.message).slice(0, 200) });
            }

            // 5) Sign-out returns to signed-out
            const out = await page.request.post(baseUrl + '/api/auth/logout');
            const meAfter = await page.request.get(baseUrl + '/api/auth/me', { headers: { accept: 'application/json' } });
            const meAfterBody = await meAfter.json().catch(() => ({}));
            leg.steps.push({ step: 'signout', logoutStatus: out.status(), authenticatedAfter: meAfterBody.authenticated ?? null });
            await shot(page, `${vp.name}-04-signed-out`);
        } else if (runAuthenticated) {
            leg.steps.push({ step: 'authenticated_legs', verdict: 'blocked', reason: 'QA_SUPABASE_ACCESS_TOKEN secret not set' });
        }

        // Per-leg verdict
        const landing = leg.steps.find((s) => s.step === 'landing');
        const landingOk = landing && landing.status < 400 && landing.hasRoot && !landing.wrongDocsRoute;
        leg.verdict = landingOk ? (accessToken ? 'pass' : 'partial-unauthenticated') : 'failed';
    } catch (e) {
        leg.verdict = 'failed';
        leg.error = String(e.message).slice(0, 300);
    } finally {
        await context.close();
    }
    report.legs.push(leg);
    await Actor.pushData({ type: 'leg', ...leg });
}

await browser.close();

// Overall verdict
const verdicts = report.legs.map((l) => l.verdict);
report.verdict = verdicts.includes('failed') ? 'failed'
    : verdicts.every((v) => v === 'pass') ? 'pass'
    : verdicts.some((v) => v.startsWith('partial')) ? 'partial-unauthenticated' : 'blocked';
report.finishedAt = new Date().toISOString();

await kvs.setValue('REPORT', report);
await Actor.pushData({ type: 'report', ...report });
await Actor.setValue('OUTPUT', report);
console.log('QA verdict:', report.verdict, '| screenshots:', report.screenshots.length);
await Actor.exit();
