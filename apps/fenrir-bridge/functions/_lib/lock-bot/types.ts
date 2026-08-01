/** Supported locales */
export type Locale = "en" | "es" | "fr" | "de";

/** Bot conversation flow states — mirrors the mockup's finite-state-machine */
export type FlowState =
    | "start"
    | "create-input"
    | "verifying"
    | "creating"
    | "lock-ready"
    | "rotating"
    | "rotated"
    | "revoked"
    | "my-locks";

/** A single invite lock persisted in memory/DB */
export interface InviteLock {
    id: string;               // unique code e.g. "fnr-8x4m-k2p9"
    domain: string;           // e.g. "example.com"
    chatId: number;
    createdAt: number;       // unix ms
    revoked: boolean;
    rotatedFrom?: string;    // previous lock id if rotated
}

/** User session — stored per chat */
export interface Session {
    locale: Locale;
    flow: FlowState;
    pendingDomain?: string;
}

/** Callback query action identifiers sent with inline keyboards */
export const Action = {
    Create: "create",
    MyLocks: "my-locks",
    Back: "back",
    Copy: "copy",
    Rotate: "rotate",
    Revoke: "revoke",
    ConfirmRevoke: "confirm-revoke",
    CancelRevoke: "cancel-revoke",
} as const;

export type Action = (typeof Action)[keyof typeof Action];
