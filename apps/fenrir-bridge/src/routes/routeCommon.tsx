import type { Copy } from "../i18n";
import type { FriskyBridge, LiveRoomProvider } from "../services/types";
import { liveRoomProviders } from "../app/shared";

export function BrandSignature({ c, compact = false }: { c: Copy; compact?: boolean }) {
  return (
    <div className={compact ? "brand-signature compact" : "brand-signature"}>
      <span>{c.friskyForged}</span>
      <span>
        {c.friskyMagicPrefix} <strong>Fenrir Protocol</strong> {c.friskyMagicSuffix}
      </span>
      <small>{c.friskyCompany}</small>
    </div>
  );
}

export function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

export function providerLabel(provider: LiveRoomProvider, c: Copy) {
  const labels: Record<LiveRoomProvider, string> = {
    zoom: "Zoom",
    webex: "Microsoft Teams",
    whereby: "Whereby",
    google_meet: "Google Meet",
    other: c.openCall.toLowerCase()
  };
  return labels[provider];
}

export function ProviderBadge({ provider, c, compact = false }: { provider: LiveRoomProvider; c: Copy; compact?: boolean }) {
  const meta = liveRoomProviders.find((item) => item.id === provider);
  const label = providerLabel(provider, c);
  return (
    <span className={`provider-brand provider-brand-${provider} ${compact ? "compact-provider-brand" : ""}`} aria-label={`${label} logo`}>
      <span className="provider-logo-mark">{meta?.icon ?? label[0]}</span>
      <span className="provider-logo-word">{meta?.brand ?? label}</span>
    </span>
  );
}

export function bridgeGroupPhotoUrl(bridge: FriskyBridge) {
  const explicitPhoto = bridge.telegramGroupImageUrl.trim();
  if (explicitPhoto) return explicitPhoto;
  const chatId = bridge.telegramChatId.trim();
  if (!chatId) return "";
  return `/api/telegram/chat-photo?chat_id=${encodeURIComponent(chatId)}`;
}

export function GroupAvatar({ bridge }: { bridge: FriskyBridge }) {
  const photoUrl = bridgeGroupPhotoUrl(bridge);
  return (
    <span className="group-avatar" style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}>
      <span>🐺</span>
    </span>
  );
}
