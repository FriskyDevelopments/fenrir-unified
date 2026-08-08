export type Plan = "free" | "starter" | "pro" | "operator";
export type DomainStatus = "pending" | "verified" | "failed";
export type DnsProvider = "cloudflare" | "external";
export type CertificateStatus = "not_requested" | "dns_pending" | "issuing" | "active" | "failed";
export type BridgeStatus = "active" | "revoked" | "paused";
export type LiveRoomStatus = "active" | "paused";
export type LiveRoomProvider = "zoom" | "webex" | "whereby" | "google_meet" | "other";
export type InviteStatus = "active" | "revoked";
export type AuditAction =
  | "user_created"
  | "domain_added"
  | "domain_verified"
  | "bridge_created"
  | "invite_rotated"
  | "invite_revoked"
  | "bridge_revoked"
  | "live_room_created"
  | "live_room_paused"
  | "live_room_opened"
  | "dns_check_failed"
  | "telegram_permission_failed"
  | "commission_link_clicked"
  | "domain_provider_recommended"
  | "domain_auction_opened"
  | "jules_ticket_created"
  | "gemini_dns_explained"
  | "cursor_handoff_exported";

export type FriskyUser = {
  id: string;
  email: string;
  name: string;
  authProvider: string;
  createdAt: string;
};

export type FriskyOrg = {
  id: string;
  ownerUserId: string;
  name: string;
  plan: Plan;
  createdAt: string;
};

export type FriskyDomain = {
  id: string;
  orgId: string;
  domain: string;
  verificationToken: string;
  txtRecordName: string;
  txtRecordValue: string;
  cnameHost: string;
  cnameTarget: string;
  status: DomainStatus;
  dnsProvider: DnsProvider;
  certificateStatus: CertificateStatus;
  cloudflareHostnameId?: string;
  cloudflareNameservers?: string[];
  createdAt: string;
  verifiedAt?: string;
};

export type FriskyBridge = {
  id: string;
  orgId: string;
  domainId: string;
  slug: string;
  publicUrl: string;
  telegramChatId: string;
  telegramGroupName: string;
  telegramGroupImageUrl: string;
  currentInviteId: string;
  status: BridgeStatus;
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
};

export type FriskyTelegramInvite = {
  id: string;
  bridgeId: string;
  inviteLink: string;
  status: InviteStatus;
  createdAt: string;
  revokedAt?: string;
};

export type FriskyLiveRoom = {
  id: string;
  orgId: string;
  domainId: string;
  slug: string;
  title: string;
  provider: LiveRoomProvider;
  targetUrl: string;
  publicUrl: string;
  coverImageUrl: string;
  status: LiveRoomStatus;
  createdAt: string;
  lastOpenedAt?: string;
};

export type FriskyAuditLog = {
  id: string;
  orgId: string;
  actorUserId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
};

export type FriskyCommissionLink = {
  id: string;
  orgId: string;
  label: string;
  provider: string;
  url: string;
  category: "dns" | "domain" | "security" | "hosting" | "telegram" | "other";
  status: "active" | "pending" | "paused";
  partnerStatus: "approved" | "pending" | "fallback" | "recommended";
  commissionNote: string;
  clicks: number;
  createdAt: string;
};

export type TelegramPermissionCheck = {
  chatId: string;
  botIsAdmin: boolean;
  canInviteUsers: boolean;
  canRevokeLinks: boolean;
  status: "ready" | "missing_permissions";
};

export type AppState = {
  user: FriskyUser;
  org: FriskyOrg;
  domains: FriskyDomain[];
  bridges: FriskyBridge[];
  liveRooms: FriskyLiveRoom[];
  invites: FriskyTelegramInvite[];
  auditLogs: FriskyAuditLog[];
  telegramChecks: TelegramPermissionCheck[];
  commissionLinks: FriskyCommissionLink[];
};

export type CommunitySecurityReport = {
  community: {
    id: string;
    slug: string;
    name: string;
  };
  users: {
    total: number;
    verified: number;
    blocked: number;
    pending: number;
    missingDisplayName: number;
  };
  sessions: {
    total: number;
    successful: number;
    failed: number;
    blocked: number;
    expired: number;
    pending: number;
  };
  impact: {
    blockedAttempts: number;
    usersNeedingProfileFixes: number;
    fullyVerifiedUsers: number;
  };
  generatedAt: string;
};
