import { createFriskyId } from './id';
import type {
  AppState,
  AuditAction,
  FriskyAuditLog,
  FriskyBridge,
  FriskyDomain,
  FriskyLiveRoom,
  FriskyTelegramInvite,
  LiveRoomProvider,
} from './types';

const now = new Date().toISOString();

const seedUserId = 'frisky_usr_8K2M9X';
const seedOrgId = 'frisky_org_7BQZ2A';
export const store: AppState = {
  user: {
    id: seedUserId,
    email: 'Frisky Signal',
    name: 'Frisky Operator',
    authProvider: 'google',
    createdAt: now,
  },
  org: {
    id: seedOrgId,
    ownerUserId: seedUserId,
    name: 'Frisky Dev Workspace',
    plan: 'starter',
    createdAt: now,
  },
  domains: [
    {
      id: 'frisky_domain_FENRIR_MAIN',
      orgId: seedOrgId,
      domain: 'www.myfenrir.com',
      verificationToken: 'FENRIR2026',
      txtRecordName: '_fenrir',
      txtRecordValue: 'fenrir-verify=FENRIR2026',
      cnameHost: 'main',
      cnameTarget: 'bridge.myfenrir.com',
      status: 'verified',
      dnsProvider: 'cloudflare',
      certificateStatus: 'active',
      cloudflareHostnameId: 'cf_fenrir_main',
      cloudflareNameservers: ['aria.ns.cloudflare.com', 'hank.ns.cloudflare.com'],
      createdAt: now,
      verifiedAt: now,
    },
  ],
  bridges: [
    {
      id: 'frisky_bridge_CLIENT_LAUNCH',
      orgId: seedOrgId,
      domainId: 'frisky_domain_FENRIR_MAIN',
      slug: 'client-launch',
      publicUrl: 'https://www.myfenrir.com/client-launch',
      telegramChatId: '-10020260513',
      telegramGroupName: 'Client Launch Room',
      telegramGroupImageUrl: '',
      currentInviteId: 'frisky_invite_CLIENT_LAUNCH',
      status: 'active',
      createdAt: now,
      rotatedAt: now,
    },
  ],
  liveRooms: [
    {
      id: 'frisky_room_CLIENT_BRIEFING',
      orgId: seedOrgId,
      domainId: 'frisky_domain_FENRIR_MAIN',
      slug: 'client-briefing',
      title: 'Client Briefing Room',
      provider: 'google_meet',
      targetUrl: 'https://meet.google.com/client-briefing',
      publicUrl: 'https://www.myfenrir.com/client-briefing',
      coverImageUrl: '/fenrir-splash-icon.svg',
      status: 'active',
      createdAt: now,
    },
  ],
  invites: [
    {
      id: 'frisky_invite_CLIENT_LAUNCH',
      bridgeId: 'frisky_bridge_CLIENT_LAUNCH',
      inviteLink: 'https://t.me/+clientFenrirInvite',
      status: 'active',
      createdAt: now,
    },
  ],
  auditLogs: [],
  telegramChecks: [],
  commissionLinks: [
    {
      id: 'frisky_com_DYNADOT',
      orgId: seedOrgId,
      label: 'Buy domains on Dynadot',
      provider: 'Dynadot Ambassador',
      url: '/go/dynadot',
      category: 'domain',
      status: 'pending',
      partnerStatus: 'pending',
      commissionNote:
        'Primary domain partner. Ambassador application pending; paste final affiliate URL here when approved.',
      clicks: 0,
      createdAt: now,
    },
    {
      id: 'frisky_com_DYNADOT_AUCTIONS',
      orgId: seedOrgId,
      label: 'Dynadot Auctions',
      provider: 'Dynadot',
      url: '/go/dynadot-auctions',
      category: 'domain',
      status: 'pending',
      partnerStatus: 'pending',
      commissionNote:
        'Premium/expired domain path. Use for auctions, backorders, and marketplace education.',
      clicks: 0,
      createdAt: now,
    },
    {
      id: 'frisky_com_CJ_DYNADOT',
      orgId: seedOrgId,
      label: 'CJ fallback',
      provider: 'CJ Affiliate',
      url: '/go/cj-dynadot',
      category: 'domain',
      status: 'paused',
      partnerStatus: 'fallback',
      commissionNote: 'Fallback if Dynadot Ambassador signup keeps throwing server errors.',
      clicks: 0,
      createdAt: now,
    },
    {
      id: 'frisky_com_CLOUDFLARE',
      orgId: seedOrgId,
      label: 'Cloudflare DNS',
      provider: 'Cloudflare',
      url: '/go/cloudflare',
      category: 'dns',
      status: 'active',
      partnerStatus: 'recommended',
      commissionNote:
        'Recommended for DNS, SSL, and support reduction. Do not rely on it as cash commission.',
      clicks: 41,
      createdAt: now,
    },
    {
      id: 'frisky_com_PORKBUN',
      orgId: seedOrgId,
      label: 'Porkbun backup',
      provider: 'Porkbun',
      url: '/go/porkbun',
      category: 'domain',
      status: 'paused',
      partnerStatus: 'fallback',
      commissionNote: 'Cheap domain backup. Not the main commission path right now.',
      clicks: 18,
      createdAt: now,
    },
    {
      id: 'frisky_com_NAMECHEAP',
      orgId: seedOrgId,
      label: 'Transfer domain',
      provider: 'Namecheap',
      url: '/go/namecheap',
      category: 'domain',
      status: 'active',
      partnerStatus: 'fallback',
      commissionNote: 'Known fallback for domains, transfers, hosting, and SSL.',
      clicks: 12,
      createdAt: now,
    },
    {
      id: 'frisky_com_DIGITALOCEAN',
      orgId: seedOrgId,
      label: 'DigitalOcean Operator Mode',
      provider: 'DigitalOcean',
      url: 'https://m.do.co/c/e31bed76086e',
      category: 'hosting',
      status: 'active',
      partnerStatus: 'approved',
      commissionNote:
        'Real referral link added. Use for always-on bot hosting, managed Postgres, and operator deployments; payout is infrastructure credit.',
      clicks: 0,
      createdAt: now,
    },
  ],
};

function log(
  action: AuditAction,
  targetType: string,
  targetId: string,
  metadata: Record<string, string | number | boolean>
): FriskyAuditLog {
  return {
    id: createFriskyId('audit', action),
    orgId: seedOrgId,
    actorUserId: seedUserId,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

export function appendAudit(
  action: AuditAction,
  targetType: string,
  targetId: string,
  metadata: Record<string, string | number | boolean> = {}
) {
  store.auditLogs.unshift(log(action, targetType, targetId, metadata));
}

export function trackCommissionClick(linkId: string) {
  const link = store.commissionLinks.find(
    (item) => item.id === linkId || item.url.endsWith(linkId)
  );
  if (!link) {
    return null;
  }
  link.clicks += 1;
  appendAudit('commission_link_clicked', 'FriskyCommissionLink', link.id, {
    provider: link.provider,
    category: link.category,
  });
  if (link.provider.toLowerCase().includes('dynadot') && link.url.includes('auction')) {
    appendAudit('domain_auction_opened', 'FriskyCommissionLink', link.id, {
      provider: link.provider,
    });
  }
  return link;
}

export function addDomain(domain: string): FriskyDomain {
  const token = Math.random().toString(36).slice(2, 10).toUpperCase();
  const host = domain.split('.')[0] || 'join';
  const item: FriskyDomain = {
    id: createFriskyId('domain', domain),
    orgId: store.org.id,
    domain,
    verificationToken: token,
    txtRecordName: '_fenrir',
    txtRecordValue: `fenrir-verify=${token}`,
    cnameHost: host,
    cnameTarget: 'bridge.myfenrir.com',
    status: 'pending',
    dnsProvider: 'cloudflare',
    certificateStatus: 'dns_pending',
    cloudflareHostnameId: createFriskyId('domain', 'cf'),
    cloudflareNameservers: ['aria.ns.cloudflare.com', 'hank.ns.cloudflare.com'],
    createdAt: new Date().toISOString(),
  };
  store.domains.unshift(item);
  appendAudit('domain_added', 'FriskyDomain', item.id, { domain });
  return item;
}

export function addBridge(
  domainId: string,
  slug: string,
  telegramChatId: string,
  telegramGroupName: string,
  telegramGroupImageUrl: string
): FriskyBridge {
  const domain = store.domains.find((item) => item.id === domainId) ?? store.domains[0];
  const invite: FriskyTelegramInvite = {
    id: createFriskyId('invite', slug),
    bridgeId: '',
    inviteLink: `https://t.me/+${slug}FenrirInvite${Math.random().toString(36).slice(2, 5)}`,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  const bridge: FriskyBridge = {
    id: createFriskyId('bridge', slug),
    orgId: store.org.id,
    domainId: domain.id,
    slug,
    publicUrl: `https://${domain.domain}/${slug}`,
    telegramChatId,
    telegramGroupName: telegramGroupName || `${slug} Telegram Group`,
    telegramGroupImageUrl,
    currentInviteId: invite.id,
    status: 'active',
    createdAt: new Date().toISOString(),
    rotatedAt: new Date().toISOString(),
  };
  invite.bridgeId = bridge.id;
  store.bridges.unshift(bridge);
  store.invites.unshift(invite);
  appendAudit('bridge_created', 'FriskyBridge', bridge.id, { slug, telegramChatId });
  return bridge;
}

export function addLiveRoom(
  domainId: string,
  slug: string,
  title: string,
  provider: LiveRoomProvider,
  targetUrl: string,
  coverImageUrl: string
): FriskyLiveRoom {
  const domain = store.domains.find((item) => item.id === domainId) ?? store.domains[0];
  const room: FriskyLiveRoom = {
    id: createFriskyId('room', slug),
    orgId: store.org.id,
    domainId: domain.id,
    slug,
    title: title || `${slug} Live Room`,
    provider,
    targetUrl,
    publicUrl: `https://${domain.domain}/${slug}`,
    coverImageUrl,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  store.liveRooms.unshift(room);
  appendAudit('live_room_created', 'FriskyLiveRoom', room.id, { provider, slug });
  return room;
}

export function pauseLiveRoom(roomId: string) {
  const room = store.liveRooms.find((item) => item.id === roomId);
  if (!room) return null;
  room.status = 'paused';
  appendAudit('live_room_paused', 'FriskyLiveRoom', room.id, { slug: room.slug });
  return room;
}
