import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gift, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  grantCourtesy,
  listCourtesies,
  revokeCourtesy,
  type CourtesyRecord,
} from "@/lib/courtesy.functions";

type CourtesyUser = { email: string; telegram_id: number | null };

export function CourtesyPanel({ users }: { users: CourtesyUser[] }) {
  const list = useServerFn(listCourtesies);
  const grant = useServerFn(grantCourtesy);
  const revoke = useServerFn(revokeCourtesy);
  const [records, setRecords] = useState<CourtesyRecord[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byTelegramId = useMemo(
    () => new Map(users.filter((user) => user.telegram_id).map((user) => [String(user.telegram_id), user.email])),
    [users],
  );
  const load = useCallback(() => {
    void list().then(setRecords).catch((error: unknown) => {
      setRecords([]);
      setMessage(error instanceof Error ? error.message : "Could not load courtesies");
    });
  }, [list]);

  useEffect(load, [load]);

  async function grantTo(user: CourtesyUser, duration: "30d" | "90d" | "6m") {
    if (!user.telegram_id) return;
    setBusy(String(user.telegram_id));
    try {
      await grant({ data: { telegramUserId: String(user.telegram_id), duration } });
      setMessage(`Courtesy ${duration} granted to ${user.email}.`);
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Courtesy could not be granted");
    } finally {
      setBusy(null);
    }
  }

  async function revokeFrom(telegramUserId: string) {
    setBusy(telegramUserId);
    try {
      await revoke({ data: { telegramUserId } });
      setMessage("Courtesy revoked.");
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Courtesy could not be revoked");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-violet-400/25 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.16),transparent_42%),rgba(7,10,18,0.78)] p-5 shadow-[0_28px_80px_-55px_rgba(139,92,246,0.9)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-violet-300">
            <ShieldCheck className="h-4 w-4" /> Owner only
          </p>
          <h2 className="mt-2 text-xl font-semibold">Courtesy access</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Grant temporary Gate access by linked Telegram ID. Group admins cannot see or call these controls.
          </p>
        </div>
        <Gift className="h-8 w-8 text-violet-300" />
      </div>

      {message ? <p className="mt-4 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs">{message}</p> : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {users.filter((user) => user.telegram_id).map((user) => (
          <div key={user.email} className="rounded-xl border border-border/60 bg-background/45 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.email}</p>
                <p className="font-mono text-[10px] text-muted-foreground">TG {user.telegram_id}</p>
              </div>
              <div className="flex gap-1">
                {(["30d", "90d", "6m"] as const).map((duration) => (
                  <Button key={duration} size="sm" variant="outline" disabled={busy === String(user.telegram_id)} onClick={() => void grantTo(user, duration)}>
                    {duration}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-border/60 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active courtesies</p>
        {records === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active courtesies.</p>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <div key={record.telegram_user_id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{byTelegramId.get(record.telegram_user_id) ?? `Telegram ${record.telegram_user_id}`}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{record.duration} · expires {new Date(record.expires_at * 1000).toLocaleDateString()}</span>
                </div>
                <Button size="icon" variant="ghost" disabled={busy === record.telegram_user_id} onClick={() => void revokeFrom(record.telegram_user_id)} aria-label="Revoke courtesy">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
