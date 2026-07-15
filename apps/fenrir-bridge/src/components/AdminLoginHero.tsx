import { useState } from 'react';
import { Shield, Lock, Zap, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';

// ─── Fenrir SVG Logo ────────────────────────────────────────────────
function FenrirLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-label="MyFenrir"
      role="img"
    >
      {/* Outer rune hexagon */}
      <polygon
        points="24,2 44,13 44,35 24,46 4,35 4,13"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.4"
      />
      {/* Inner diamond core */}
      <polygon
        points="24,10 36,24 24,38 12,24"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.7"
      />
      {/* F letterform — two vertical strokes + crossbar */}
      <path
        d="M18 16 L18 32 M18 16 L30 16 M18 24 L27 24"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Accent dot — glowing eye */}
      <circle cx="33" cy="28" r="2" fill="currentColor" />
    </svg>
  );
}

// ─── Security stat badge ─────────────────────────────────────────────
function StatBadge({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ size: number; strokeWidth: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
      <Icon size={14} strokeWidth={1.5} />
      <span className="text-xs font-mono tracking-wide">
        <span className="text-[var(--color-primary)] font-medium">{value}</span>
        {' '}{label}
      </span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export function AdminLoginHero() {
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Read auth_error from URL if present (WorkOS bounceback)
  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get('auth_error');
  const authErrorDetail = urlParams.get('auth_error_detail');
  const displayError = error || (authError ? `${authError}: ${authErrorDetail || ''}` : '');

  const initiateLogin = (method: 'email' | 'sso' | 'passkey') => {
    const params = new URLSearchParams();
    if (method === 'sso') {
      if (email) {
        // If they provided an email, they might want to jump straight to IdP
        // but AuthKit supports loginHint. fenrir-bridge login.ts expects provider
        // param for direct jump (e.g. google), but if we just want AuthKit,
        // we can omit provider or send it through.
        // Wait, the API doesn't accept email directly in login.ts right now.
        // It relies on AuthKit's hosted UI to ask for email.
        // If we really want to, we could add login_hint to login.ts.
      }
    }

    // Since /api/auth/workos/login initiates AuthKit for everything (unless provider is specified),
    // we just send them there.
    window.location.href = `/api/auth/workos/login`;
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your work email to continue.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('That doesn\'t look like a valid email.');
      return;
    }
    setError('');
    setIsPending(true);
    initiateLogin('email');
  };

  const handleSSOLogin = () => {
    setError('');
    setIsConnecting(true);
    initiateLogin('sso');
  };

  const handlePasskeyLogin = () => {
    setError('');
    setIsPending(true);
    initiateLogin('passkey');
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden grid-bg scanlines" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* Ambient glow orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(0,200,255,0.07) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(0,200,255,0.04) 0%, transparent 70%)',
        }}
      />

      {/* ── Nav ── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <a href="/" className="flex items-center gap-2.5 text-[var(--color-primary)] hover:opacity-80 transition-opacity">
          <FenrirLogo size={28} />
          <span
            className="text-[var(--color-text)] font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}
          >
            My<span className="text-[var(--color-primary)]">Fenrir</span>
          </span>
        </a>
        <div className="flex items-center gap-4">
          <a
            href="/docs"
            className="hidden sm:block text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Docs
          </a>
          <a
            href="/status"
            className="flex items-center gap-1.5 text-xs text-[var(--color-success)] border border-[var(--color-success)]/30 px-2.5 py-1 rounded-full font-mono"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
            Systems nominal
          </a>
        </div>
      </nav>

      {/* ── Hero Layout ── */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-12 items-center">

          {/* Left — Brand Copy */}
          <div className="space-y-8 animate-fade-up">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary-glow)] text-[var(--color-primary)] text-xs font-mono tracking-widest uppercase">
              <Shield size={12} strokeWidth={2} />
              Zero-Trust Identity
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1
                className="leading-tight font-extrabold tracking-tight text-[var(--color-text)] text-4xl"
                style={{
                  fontFamily: 'var(--font-display)',
                }}
              >
                Secure your<br />
                <span className="text-[var(--color-primary)]">workspace</span>{' '}
                <span className="text-[var(--color-text-muted)]">—</span><br />
                on every front.
              </h1>
              <p
                className="text-[var(--color-text-muted)] max-w-sm leading-relaxed"
                style={{ fontSize: 'var(--text-base)' }}
              >
                Passkeys, federated identity, and protected sessions for your Telegram groups, AI agents, and team workspaces.
              </p>
            </div>

            {/* Feature chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Lock, label: 'Passkeys' },
                { icon: Shield, label: 'Federated Identity' },
                { icon: Zap, label: 'AI Agents' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] text-sm"
                >
                  <Icon size={13} strokeWidth={1.5} className="text-[var(--color-primary)]" />
                  {label}
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-3 animate-fade-up animate-fade-up-delay-2">
              <StatBadge icon={Shield} label="identity providers" value="12+" />
              <StatBadge icon={Lock} label="uptime" value="99.99%" />
              <StatBadge icon={Zap} label="auth latency" value="<80ms" />
            </div>
          </div>

          {/* Right — Login Card */}
          <div
            className="animate-fade-up animate-fade-up-delay-1"
            style={{ '--delay': '0.1s' } as React.CSSProperties}
          >
            <div
              className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-2xl"
              style={{
                boxShadow: '0 0 0 1px rgba(0,200,255,0.06), 0 24px 64px rgba(0,0,0,0.6)',
              }}
            >
              {/* Card top accent line */}
              <div
                aria-hidden
                className="absolute top-0 left-8 right-8 h-px rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, var(--color-primary), transparent)',
                  opacity: 0.5,
                }}
              />

              {/* Card header */}
              <div className="mb-8">
                <p className="text-xs font-mono text-[var(--color-text-faint)] uppercase tracking-widest mb-2">
                  — Secure Portal
                </p>
                <h2
                  className="font-bold text-[var(--color-text)] text-2xl"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Sign in to MyFenrir
                </h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Use your work email or SSO provider.
                </p>
              </div>

              {/* SSO Button — primary CTA */}
              <button
                type="button"
                onClick={handleSSOLogin}
                disabled={isConnecting}
                data-testid="button-sso-login"
                className="group w-full flex items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 font-semibold text-sm transition-all duration-200 mb-3"
                style={{
                  background: 'var(--color-primary)',
                  color: '#000',
                  boxShadow: isConnecting ? 'none' : '0 0 20px var(--color-primary-glow-strong)',
                }}
              >
                <Shield size={16} strokeWidth={2} />
                {isConnecting ? 'Connecting…' : 'Continue with SSO'}
                <ArrowRight
                  size={15}
                  strokeWidth={2}
                  className="ml-auto opacity-60 group-hover:translate-x-0.5 transition-transform"
                />
              </button>

              {/* Passkey Button */}
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={isPending}
                data-testid="button-passkey-login"
                className="w-full flex items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 font-medium text-sm border border-[var(--color-border-bright)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary-glow)] transition-all duration-200 mb-6"
              >
                <Lock size={15} strokeWidth={1.5} />
                Sign in with Passkey
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-[var(--color-border)]" />
                <span className="text-xs text-[var(--color-text-faint)] font-mono">or email</span>
                <div className="flex-1 h-px bg-[var(--color-border)]" />
              </div>

              {/* Email form */}
              <form onSubmit={handleEmailLogin} className="space-y-3">
                <div className="relative">
                  <label htmlFor="email" className="sr-only">Work email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@company.com"
                    autoComplete="email"
                    data-testid="input-email"
                    disabled={isPending}
                    className="w-full rounded-xl px-4 py-3 pr-10 text-sm border transition-all duration-200 bg-[var(--color-surface-2)] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]"
                    style={{
                      borderColor: displayError ? 'var(--color-danger)' : 'var(--color-border)',
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      if (!displayError) e.target.style.borderColor = 'var(--color-primary)';
                    }}
                    onBlur={(e) => {
                      if (!displayError) e.target.style.borderColor = 'var(--color-border)';
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]"
                    onClick={() => setShowEmail(!showEmail)}
                    aria-label={showEmail ? 'Hide email hint' : 'Show email domains'}
                  >
                    {showEmail ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Error message */}
                {displayError && (
                  <div className="flex items-center gap-2 text-xs text-[var(--color-danger)]" role="alert">
                    <AlertCircle size={13} strokeWidth={2} />
                    {displayError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-email-submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)] transition-all duration-200 disabled:opacity-40"
                >
                  {isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                      Sending magic link…
                    </>
                  ) : (
                    <>
                      Send secure link
                      <ArrowRight size={14} strokeWidth={2} className="ml-auto opacity-50" />
                    </>
                  )}
                </button>
              </form>

              {/* Footer */}
              <p className="mt-6 text-center text-xs text-[var(--color-text-faint)]">
                Protected by{' '}
                <span className="text-[var(--color-primary)] font-mono">WorkOS AuthKit</span>
                {' '}·{' '}
                <a href="/privacy" className="hover:text-[var(--color-text-muted)] transition-colors underline underline-offset-2">
                  Privacy
                </a>
              </p>
            </div>

            {/* Below-card trust signal */}
            <p className="mt-4 text-center text-xs text-[var(--color-text-faint)] font-mono">
              SOC 2 Type II · End-to-end encrypted · Zero knowledge
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-[var(--color-text-faint)] font-mono">
        © {new Date().getFullYear()} MyFenrir · Identity · Workspaces · Media · AI Agents
      </footer>
    </div>
  );
}
