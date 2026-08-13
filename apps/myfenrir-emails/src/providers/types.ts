// Transport-agnostic send contract. Templates never know which provider runs.

export interface SendAttachment {
  filename: string;
  content: string; // base64-encoded bytes
  type: string; // MIME type, e.g. application/pdf
  disposition?: "attachment" | "inline";
  contentId?: string; // for inline images
}

export interface SendInput {
  to: string | string[];
  fromEmail: string;
  fromName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: SendAttachment[];
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  provider: string;
  id?: string; // messageId if available
  status: number; // HTTP-ish status for the API layer
  error?: string;
  code?: string; // provider error code (e.g. E_SENDER_NOT_VERIFIED)
}

// Minimal shape of the Cloudflare Email Service binding we rely on.
export interface EmailBinding {
  send(message: Record<string, unknown>): Promise<{ messageId: string }>;
}

export interface ProviderEnv {
  EMAIL?: EmailBinding;
  RESEND_API_KEY?: string;
  MAILERSEND_API_KEY?: string;
}

export function toArray(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}
