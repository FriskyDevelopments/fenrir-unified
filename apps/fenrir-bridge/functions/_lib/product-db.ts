import type { SessionPayload } from './auth';
import { effectiveOrgBillingPlan } from './billing-db';

type DomainRow = {
  id: string;
  org_id: string;
  domain: string;
  verification_token: string;
  txt_record_name: string;
  txt_record_value: string;
  cname_host: string;
  cname_target: string;
  status: string;
  dns_provider: string;
  certificate_status: string;
  cloudflare_hostname_id: string | null;
  cloudflare_nameservers: string | null;
  created_at: string;
  verified_at: string | null;
};

type BridgeRow = {
  id: string;
  org_id: string;
  domain_id: string;
  slug: string;
  public_url: string;
  telegram_chat_id: string;
  telegram_group_name: string;
  telegram_group_image_url: string;
  current_invite_id: string;
  status: string;
  created_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
};

type InviteRow = {
  id: string;
  bridge_id: string;
  invite_link: string;
  status: string;
  created_at: string;
  revoked_at: string | null;
};

type RoomRow = {
  id: string;
  org_id: string;
  domain_id: string;
  slug: string;
  title: string;
  provider: string;
  target_url: string;
  public_url: string;
  cover_image_url: string;
  status: string;
  created_at: string;
  last_opened_at: string | null;
};

type TelegramCheckRow = {
  chat_id: string;
  bot_is_admin: number;
  can_invite_users: number;
  can_revoke_links: number;
  status: string;
};

type AuditRow = {
  id: string;
  org_id: string;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata_json: string;
  created_at: string;
};

const nowIso = () => new Date().toISOString();

export function createProductId(
  kind: 'domain' | 'bridge' | 'room' | 'invite' | 'audit',
  hint = ''
) {
  const prefixes = {
    domain: 'frisky_dom',
    bridge: 'frisky_brg',
    room: 'frisky_room',
    invite: 'frisky_inv',
    audit: 'frisky_aud',
  };
  const cleaned = hint
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 8)
    .padEnd(4, 'X');
  return `${prefixes[kind]}_${cleaned}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

export function cleanSlug(value: string, fallback = 'main') {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function cleanDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export function publicUrl(domain: string, slug: string) {
  return `https://${domain}/${slug}`;
}

export async function loadAppState(db: D1Database, session: SessionPayload) {
  const [domains, bridges, invites, rooms, telegramChecks, auditLogs, plan] = await Promise.all([
    db
      .prepare(`SELECT * FROM frisky_domains WHERE org_id = ? ORDER BY created_at DESC`)
      .bind(session.frisky_org_id)
      .all<DomainRow>(),
    db
      .prepare(`SELECT * FROM frisky_bridges WHERE org_id = ? ORDER BY created_at DESC`)
      .bind(session.frisky_org_id)
      .all<BridgeRow>(),
    db
      .prepare(
        `SELECT i.* FROM frisky_invites i JOIN frisky_bridges b ON b.id = i.bridge_id WHERE b.org_id = ? ORDER BY i.created_at DESC`
      )
      .bind(session.frisky_org_id)
      .all<InviteRow>(),
    db
      .prepare(`SELECT * FROM frisky_live_rooms WHERE org_id = ? ORDER BY created_at DESC`)
      .bind(session.frisky_org_id)
      .all<RoomRow>(),
    db
      .prepare(`SELECT * FROM telegram_permission_checks WHERE org_id = ? ORDER BY checked_at DESC`)
      .bind(session.frisky_org_id)
      .all<TelegramCheckRow>(),
    db
      .prepare(
        `SELECT * FROM frisky_audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`
      )
      .bind(session.frisky_org_id)
      .all<AuditRow>(),
    effectiveOrgBillingPlan({ DB: db }, session.frisky_org_id),
  ]);

  return {
    user: {
      id: session.frisky_user_id,
      email: session.email,
      name: session.name,
      authProvider: session.provider,
      createdAt: new Date(session.iat * 1000).toISOString(),
    },
    org: {
      id: session.frisky_org_id,
      ownerUserId: session.frisky_user_id,
      name: `${session.name}'s Fenrir`,
      plan,
      createdAt: new Date(session.iat * 1000).toISOString(),
    },
    domains: (domains.results ?? []).map(mapDomain),
    bridges: (bridges.results ?? []).map(mapBridge),
    liveRooms: (rooms.results ?? []).map(mapRoom),
    invites: (invites.results ?? []).map(mapInvite),
    auditLogs: (auditLogs.results ?? []).map(mapAudit),
    telegramChecks: (telegramChecks.results ?? []).map(mapTelegramCheck),
    commissionLinks: [
      {
        id: 'frisky_com_CLOUDFLARE',
        orgId: session.frisky_org_id,
        label: 'Cloudflare DNS',
        provider: 'Cloudflare',
        url: '/go/cloudflare',
        category: 'dns',
        status: 'active',
        partnerStatus: 'recommended',
        commissionNote: 'Recommended for DNS, SSL, and lower support friction.',
        clicks: 0,
        createdAt: nowIso(),
      },
    ],
  };
}

export async function addAudit(
  db: D1Database,
  session: SessionPayload,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string | number | boolean> = {}
) {
  await db
    .prepare(
      `INSERT INTO frisky_audit_logs (
        id, org_id, actor_user_id, action, target_type, target_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      createProductId('audit', action),
      session.frisky_org_id,
      session.frisky_user_id,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      nowIso()
    )
    .run();
}

export async function getDomainForOrg(db: D1Database, orgId: string, domainId: string) {
  const row = await db
    .prepare(`SELECT * FROM frisky_domains WHERE id = ? AND org_id = ?`)
    .bind(domainId, orgId)
    .first<DomainRow>();
  return row ? mapDomain(row) : null;
}

export async function getBridgeForOrg(db: D1Database, orgId: string, bridgeId: string) {
  const row = await db
    .prepare(`SELECT * FROM frisky_bridges WHERE id = ? AND org_id = ?`)
    .bind(bridgeId, orgId)
    .first<BridgeRow>();
  return row ? mapBridge(row) : null;
}

export async function getActiveBridgeForOrg(db: D1Database, orgId: string, bridgeId: string) {
  const row = await db
    .prepare(`SELECT * FROM frisky_bridges WHERE id = ? AND org_id = ? AND status = 'active'`)
    .bind(bridgeId, orgId)
    .first<BridgeRow>();
  return row ? mapBridge(row) : null;
}

export async function getActiveBridgeForOrgByChatId(db: D1Database, orgId: string, chatId: string) {
  const row = await db
    .prepare(
      `SELECT * FROM frisky_bridges
       WHERE org_id = ? AND telegram_chat_id = ? AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(orgId, chatId)
    .first<BridgeRow>();
  return row ? mapBridge(row) : null;
}

export async function getRoomForOrg(db: D1Database, orgId: string, roomId: string) {
  const row = await db
    .prepare(`SELECT * FROM frisky_live_rooms WHERE id = ? AND org_id = ?`)
    .bind(roomId, orgId)
    .first<RoomRow>();
  return row ? mapRoom(row) : null;
}

export async function resolvePublicBridge(db: D1Database, hostname: string, slug: string) {
  const domains = publicHostCandidates(hostname);
  if (!domains.length) return null;
  const placeholders = domains.map(() => '?').join(', ');
  const bridge = await db
    .prepare(
      `SELECT b.*
       FROM frisky_bridges b
       JOIN frisky_domains d ON d.id = b.domain_id
       WHERE b.slug = ?
         AND b.status = 'active'
         AND d.status = 'verified'
         AND lower(d.domain) IN (${placeholders})
       ORDER BY b.created_at DESC
       LIMIT 1`
    )
    .bind(slug, ...domains)
    .first<BridgeRow>();
  if (!bridge) return null;
  const invite = await db
    .prepare(`SELECT * FROM frisky_invites WHERE id = ? AND status = 'active'`)
    .bind(bridge.current_invite_id)
    .first<InviteRow>();
  if (!invite) return null;
  return { bridge: mapBridge(bridge), invite: mapInvite(invite) };
}

export async function resolvePublicRoom(db: D1Database, hostname: string, slug: string) {
  const domains = publicHostCandidates(hostname);
  if (!domains.length) return null;
  const placeholders = domains.map(() => '?').join(', ');
  const room = await db
    .prepare(
      `SELECT r.*
       FROM frisky_live_rooms r
       JOIN frisky_domains d ON d.id = r.domain_id
       WHERE r.slug = ?
         AND r.status = 'active'
         AND lower(d.domain) IN (${placeholders})
       ORDER BY r.created_at DESC
       LIMIT 1`
    )
    .bind(slug, ...domains)
    .first<RoomRow>();
  return room ? mapRoom(room) : null;
}

function publicHostCandidates(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return host ? [host] : [];
  const candidates = new Set([host]);
  if (host.startsWith('www.')) {
    candidates.add(host.slice(4));
  } else {
    candidates.add(`www.${host}`);
  }
  return [...candidates];
}

export function mapDomain(row: DomainRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    domain: row.domain,
    verificationToken: row.verification_token,
    txtRecordName: row.txt_record_name,
    txtRecordValue: row.txt_record_value,
    cnameHost: row.cname_host,
    cnameTarget: row.cname_target,
    status: row.status,
    dnsProvider: row.dns_provider,
    certificateStatus: row.certificate_status,
    cloudflareHostnameId: row.cloudflare_hostname_id ?? undefined,
    cloudflareNameservers: row.cloudflare_nameservers
      ? (JSON.parse(row.cloudflare_nameservers) as string[])
      : undefined,
    createdAt: row.created_at,
    verifiedAt: row.verified_at ?? undefined,
  };
}

export function mapBridge(row: BridgeRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    domainId: row.domain_id,
    slug: row.slug,
    publicUrl: row.public_url,
    telegramChatId: row.telegram_chat_id,
    telegramGroupName: row.telegram_group_name,
    telegramGroupImageUrl: row.telegram_group_image_url,
    currentInviteId: row.current_invite_id,
    status: row.status,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export function mapInvite(row: InviteRow) {
  return {
    id: row.id,
    bridgeId: row.bridge_id,
    inviteLink: row.invite_link,
    status: row.status,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export function mapRoom(row: RoomRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    domainId: row.domain_id,
    slug: row.slug,
    title: row.title,
    provider: row.provider,
    targetUrl: row.target_url,
    publicUrl: row.public_url,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at ?? undefined,
  };
}

function mapTelegramCheck(row: TelegramCheckRow) {
  return {
    chatId: row.chat_id,
    botIsAdmin: row.bot_is_admin === 1,
    canInviteUsers: row.can_invite_users === 1,
    canRevokeLinks: row.can_revoke_links === 1,
    status: row.status,
  };
}

function mapAudit(row: AuditRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: JSON.parse(row.metadata_json || '{}'),
    createdAt: row.created_at,
  };
}
