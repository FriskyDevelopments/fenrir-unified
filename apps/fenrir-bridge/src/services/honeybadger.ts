type BrowserErrorReport = {
  name: string;
  message: string;
  stack?: string;
  source: string;
  path: string;
  userAgent: string;
};

let installed = false;

export function installHoneybadgerBrowserReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    void reportBrowserError(event.error ?? event.message, 'window.error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    void reportBrowserError(event.reason, 'window.unhandledrejection');
  });
}

export async function reportBrowserError(error: unknown, source: string) {
  const report = toBrowserErrorReport(error, source);
  if (!report.message) return;

  await fetch('/api/observability/client-error', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => undefined);
}

function toBrowserErrorReport(error: unknown, source: string): BrowserErrorReport {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: scrub(error.message || 'Unknown browser error'),
      stack: scrub(error.stack || ''),
      source,
      path: `${window.location.pathname}${window.location.search}`,
      userAgent: navigator.userAgent,
    };
  }

  return {
    name: 'Error',
    message: scrub(typeof error === 'string' ? error : 'Unknown browser error'),
    source,
    path: `${window.location.pathname}${window.location.search}`,
    userAgent: navigator.userAgent,
  };
}

function scrub(value: string) {
  return value
    .replace(/(access_token|refresh_token|id_token|code|token)=([^&\s]+)/gi, '$1=[filtered]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [filtered]')
    .slice(0, 12000);
}
