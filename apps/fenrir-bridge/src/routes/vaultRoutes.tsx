import type { Copy, Locale } from "../i18n";
import type { FriskyBridge, FriskyCommissionLink, FriskyLiveRoom } from "../services/types";
import { absoluteUrl } from "../app/shared";
import type { PersonalLink, VaultLink } from "../app/shared";
import type { UiCopy } from "../app/uiCopy";

function absoluteVaultUrl(value: string) {
  return absoluteUrl(value);
}

function buildVaultLinks(
  bridges: FriskyBridge[],
  rooms: FriskyLiveRoom[],
  personalLinks: PersonalLink[],
  commissionLinks: FriskyCommissionLink[] = []
): VaultLink[] {
  return [
    ...bridges.map((bridge) => ({
      id: bridge.id,
      title: bridge.telegramGroupName,
      url: bridge.publicUrl,
      kind: "telegram",
      status: bridge.status
    })),
    ...rooms.map((room) => ({
      id: room.id,
      title: room.title,
      url: room.publicUrl,
      kind: room.provider,
      status: room.status
    })),
    ...commissionLinks
      .filter((link) => link.status === "active" || link.partnerStatus === "recommended" || link.partnerStatus === "approved")
      .map((link) => ({
        id: link.id,
        title: link.label,
        url: absoluteVaultUrl(link.url),
        kind: link.category,
        status: link.partnerStatus
      })),
    ...personalLinks
  ].filter((link) => Boolean(absoluteVaultUrl(link.url)));
}

function createVaultShareUrl(links: VaultLink[]) {
  const payload = encodeVaultLinks(links);
  return `${window.location.origin}/vault?v=${payload}`;
}

function encodeVaultLinks(links: VaultLink[]) {
  const payload = JSON.stringify({
    v: 1,
    links: links.slice(0, 40).map((link) => ({
      id: link.id,
      title: link.title,
      url: absoluteUrl(link.url),
      kind: link.kind,
      status: link.status
    }))
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeVaultLinks() {
  const payload = new URLSearchParams(window.location.search).get("v");
  if (!payload) return [];
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { links?: VaultLink[] };
      return (parsed.links ?? [])
      .slice(0, 40)
      .map((link) => ({
        id: String(link.id || `vault_${link.url}`),
        title: String(link.title || "Fenrir link").slice(0, 90),
        url: absoluteUrl(String(link.url || "")),
        kind: String(link.kind || "link").slice(0, 32),
        status: String(link.status || "active").slice(0, 32)
      }))
      .filter((link) => link.url);
  } catch {
    return [];
  }
}

export function PublicVaultPage({ links, c, ui }: { links: VaultLink[]; c: Copy; ui: UiCopy }) {
  return (
    <main className="join-page vault-public-page">
      <section className="join-card vault-public-card">
        <span className="mark">
          <img src="/fenrir-splash-icon.svg" alt="" />
        </span>
        <p className="label">{c.linkVaultTitle}</p>
        <h1>{ui.selectedShareHeading}</h1>
        <p>{ui.selectedShareCopy}</p>
        {links.length ? (
          <div className="vault-public-grid">
            {links.map((link) => (
              <a className={`vault-public-link ${link.kind}`} href={link.url} key={`${link.id}-${link.url}`}>
                <span>{link.kind}</span>
                <b>{link.title}</b>
                <code>{link.url}</code>
                <small>{link.status}</small>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <b>{ui.noVaultLinks}</b>
            <small>{`${ui.selectedLinksPrompt} ${c.linkVaultTitle}.`}</small>
          </div>
        )}
      </section>
    </main>
  );
}