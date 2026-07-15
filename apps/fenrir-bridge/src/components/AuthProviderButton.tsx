import type { AuthProvider } from '../services/authGateway';

import { MagneticButton } from './MagneticButton';

type AuthProviderButtonProps = {
  provider: AuthProvider;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export function AuthProviderButton({
  provider,
  label,
  onClick,
  disabled = false,
}: AuthProviderButtonProps) {
  return (
    <MagneticButton
      className={`auth-provider-button ${provider}-auth-button ${provider === 'microsoft' ? 'secondary' : ''}`.trim()}
      type="button"
      onClick={onClick}
      disabled={disabled}
      strength={0.3}
    >
      <AuthProviderIcon provider={provider} />
      <span>{label}</span>
    </MagneticButton>
  );
}

export function AuthProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === 'google') {
    return (
      <span className="provider-icon google-icon" aria-hidden="true">
        <span />
      </span>
    );
  }

  if (provider === 'microsoft') {
    return (
      <span className="provider-icon microsoft-icon" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
    );
  }

  return (
    <span className="provider-icon apple-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M17.7 12.5c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6 0-.1-2.6-1.1-2.6-3.9ZM15.7 6.2c.6-.8 1.1-1.8 1-2.9-1 .1-2 .7-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2.1-.5 2.7-1.2Z" />
      </svg>
    </span>
  );
}
