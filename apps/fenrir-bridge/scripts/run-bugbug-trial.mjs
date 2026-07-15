#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const artifactsDir = resolve('artifacts/bugbug');
const envPath = resolve('.env.local');
const now = new Date().toISOString();

const suitePlan = [
  {
    key: 'BUGBUG_FENRIR_SUITE_ID',
    product: 'Fenrir Bridge',
    repo: '/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge',
    baseUrl: 'https://www.myfenrir.com',
    priority: 'P0',
  },
  {
    key: 'BUGBUG_CLIPSFLOW_SUITE_ID',
    product: 'ClipsFlow',
    repo: '/Users/friskypup/clipsflow',
    baseUrl: process.env.CLIPSFLOW_PROD_URL || '',
    priority: 'P1',
  },
  {
    key: 'BUGBUG_HOSTOS_SUITE_ID',
    product: 'HostOS / Lupita',
    repo: '/Users/friskypup/Documents/Playground/lupita-casas-de-barra',
    baseUrl: process.env.HOSTOS_PROD_URL || '',
    priority: 'P1',
  },
  {
    key: 'BUGBUG_FRISKY_GHOST_SUITE_ID',
    product: 'Frisky Ghost',
    repo: '/Users/friskypup/Documents/Playground/frisky-bot-os',
    baseUrl: 'https://friskyghost.com',
    priority: 'P1',
  },
];

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

async function loadEnv() {
  const local = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  return { ...local, ...process.env };
}

function redact(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length > 3) out = out.split(secret).join('[redacted]');
  }
  return out;
}

function run(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolveRun({ code: 127, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => {
      resolveRun({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runBugbug(args, env) {
  const command = env.BUGBUG_BIN || 'bugbug';
  const first = await run(command, args, { env });
  if (first.code !== 127) return first;
  return run('npx', ['-y', '@testrevolution/bugbug-cli', ...args], { env });
}

function parseStatus(text) {
  const lowered = text.toLowerCase();
  if (lowered.includes('status: passed')) return 'passed';
  if (lowered.includes('status: failed')) return 'failed';
  if (lowered.includes('status: error')) return 'error';
  if (lowered.includes('queued')) return 'queued';
  return 'unknown';
}

function parseRunId(text) {
  const match = text.match(/\b(?:suiteRunId|testRunId):\s*([A-Za-z0-9-]+)/);
  return match?.[1] || null;
}

async function feedFriskyMcp(packet, env) {
  if (!env.FRISKY_BOT_API_TOKEN) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_FRISKY_BOT_API_TOKEN',
    };
  }

  const request = [
    'BugBug trial results packet for repo triage.',
    'Keep findings concrete, prioritize P0/P1 regressions, and return next fixes by repo.',
    JSON.stringify(packet, null, 2),
  ].join('\n\n');

  const response = await fetch('https://mcp.friskydev.com/consult_specialist', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FRISKY_BOT_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slug: env.FRISKY_BUGBUG_SPECIALIST || 'frisky-codex-engineer',
      request,
      live_call: true,
    }),
  });
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 12000),
  };
}

async function main() {
  await mkdir(artifactsDir, { recursive: true });
  const env = await loadEnv();
  const secrets = [env.BUGBUG_API_TOKEN, env.FRISKY_BOT_API_TOKEN].filter(Boolean);

  if (!env.BUGBUG_API_TOKEN) {
    const packet = {
      generatedAt: now,
      ok: false,
      blocked: true,
      blocker: 'missing_BUGBUG_API_TOKEN',
      next: 'Add BUGBUG_API_TOKEN and suite IDs in npm run safe-box, then run npm run bugbug:trial.',
    };
    await writeFile(
      join(artifactsDir, 'latest-frisky-mcp-packet.json'),
      `${JSON.stringify(packet, null, 2)}\n`
    );
    console.error('Missing BUGBUG_API_TOKEN. Add it in the safe box first.');
    process.exit(2);
  }

  const configuredSuites = suitePlan
    .map((suite) => ({ ...suite, suiteId: env[suite.key] }))
    .filter((suite) => suite.suiteId);

  if (!configuredSuites.length) {
    const packet = {
      generatedAt: now,
      ok: false,
      blocked: true,
      blocker: 'missing_BUGBUG_SUITE_IDS',
      expectedEnvKeys: suitePlan.map((suite) => suite.key),
    };
    await writeFile(
      join(artifactsDir, 'latest-frisky-mcp-packet.json'),
      `${JSON.stringify(packet, null, 2)}\n`
    );
    console.error('Missing BugBug suite IDs. Add at least BUGBUG_FENRIR_SUITE_ID in the safe box.');
    process.exit(2);
  }

  const configured = await runBugbug(['config', 'set-token', env.BUGBUG_API_TOKEN], env);
  if (configured.code !== 0) {
    console.error(redact(configured.stderr || configured.stdout, secrets));
    process.exit(configured.code);
  }

  const results = [];
  for (const suite of configuredSuites) {
    const slug = suite.product
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const outputPath = join(artifactsDir, `${slug}.junit.xml`);
    const args = [
      'remote',
      'run',
      'suite',
      suite.suiteId,
      '--with-details',
      '--reporter',
      'junit',
      '--output-path',
      outputPath,
      '--result-timeout',
      env.BUGBUG_RESULT_TIMEOUT_MINUTES || '30',
      '--no-progress',
    ];
    if (env.BUGBUG_PROFILE_NAME) args.push('--profile', env.BUGBUG_PROFILE_NAME);
    if (suite.baseUrl) args.push('--variable', `baseUrl=${suite.baseUrl}`);

    console.error(`Running BugBug ${suite.product} suite...`);
    const runResult = await runBugbug(args, env);
    const combined = redact(`${runResult.stdout}\n${runResult.stderr}`, secrets);
    results.push({
      product: suite.product,
      priority: suite.priority,
      repo: suite.repo,
      baseUrl: suite.baseUrl || null,
      suiteId: suite.suiteId,
      status: parseStatus(combined),
      runId: parseRunId(combined),
      exitCode: runResult.code,
      reportPath: outputPath,
      outputTail: combined.split(/\r?\n/).filter(Boolean).slice(-25),
    });
  }

  const packet = {
    generatedAt: now,
    source: 'bugbug',
    trialMode: true,
    policy:
      'Run P0/P1 smoke suites first during 14-day trial; feed failures to Frisky MCP for repo-specific fixes.',
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed' && r.exitCode === 0).length,
      failed: results.filter((r) => r.exitCode !== 0 || ['failed', 'error'].includes(r.status))
        .length,
      unknown: results.filter(
        (r) => r.exitCode === 0 && !['passed', 'failed', 'error'].includes(r.status)
      ).length,
    },
    results,
  };

  await writeFile(
    join(artifactsDir, 'latest-frisky-mcp-packet.json'),
    `${JSON.stringify(packet, null, 2)}\n`
  );
  const mcp = await feedFriskyMcp(packet, env);
  await writeFile(
    join(artifactsDir, 'latest-frisky-mcp-response.json'),
    `${JSON.stringify(mcp, null, 2)}\n`
  );
  console.error(`BugBug packet saved: ${join(artifactsDir, 'latest-frisky-mcp-packet.json')}`);
  console.error(
    mcp.ok
      ? 'Frisky MCP feed: sent'
      : `Frisky MCP feed: skipped/failed (${mcp.reason || mcp.status})`
  );

  if (packet.summary.failed > 0) process.exit(1);
}

main().catch(async (error) => {
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(
    join(artifactsDir, 'latest-frisky-mcp-packet.json'),
    `${JSON.stringify({ generatedAt: now, ok: false, error: error.message }, null, 2)}\n`
  );
  console.error(error.message);
  process.exit(1);
});
