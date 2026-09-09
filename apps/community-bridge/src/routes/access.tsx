import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  decideGateAccessRequest,
  listMyGateAccessRequests,
  type GateAccessRequest,
} from "@/lib/access.functions";

export const Route = createFileRoute("/access")({ ssr: false, component: AccessPage });

function AccessPage() {
  const { session, loading } = useAuth();
  const list = useServerFn(listMyGateAccessRequests);
  const decide = useServerFn(decideGateAccessRequest);
  const [rows, setRows] = useState<GateAccessRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    if (!session) return;
    setFailed(false);
    try {
      setRows(await list());
    } catch {
      setFailed(true);
    }
  }, [list, session]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function resolve(id: string, status: "pending" | "granted" | "denied", note?: string) {
    setBusy(id);
    try {
      await decide({ data: { id, status, note } });
      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, status, decision_note: note ?? row.decision_note } : row,
        ),
      );
    } finally {
      setBusy(null);
    }
  }
  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Dashboard
      </Link>
      <p className="mt-8 font-mono text-[10px] uppercase tracking-[.2em] text-primary">
        Access control / owner queue
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Accept people, not just clicks.
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every row is a linked Telegram identity asking to enter one of your Gates. Granting lets
        them return to the Gate for a short-lived, one-use invite.
      </p>
      {failed ? (
        <div className="mt-8 rounded-xl border border-destructive/30 p-5 text-sm">
          Could not load your access queue.{" "}
          <Button variant="link" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No one is waiting for your decision.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-4">Person</th>
                <th className="px-5 py-4">Gate</th>
                <th className="px-5 py-4">Security context</th>
                <th className="px-5 py-4">Requested</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium">
                      {row.applicant_name || "Linked Telegram identity"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.applicant_email || "Private account"}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      tg:{row.telegram_user_id}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p>{row.community_label}</p>
                    <p className="font-mono text-xs text-muted-foreground">/g/{row.gate_slug}</p>
                  </td>
                  <td className="max-w-xs px-5 py-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {row.decision_note || "No security note recorded."}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {new Date(row.requested_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 capitalize">{row.status}</td>
                  <td className="px-5 py-4 text-right">
                    {row.status === "pending" ? (
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={busy === row.id}
                          onClick={() =>
                            void resolve(
                              row.id,
                              "granted",
                              "Owner approved after reviewing Gate security context.",
                            )
                          }
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy === row.id}
                          onClick={() =>
                            void resolve(
                              row.id,
                              "pending",
                              "More info required: confirm profile photo / identity continuity before a private invite is issued.",
                            )
                          }
                        >
                          Ask info
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === row.id}
                          onClick={() =>
                            void resolve(
                              row.id,
                              "denied",
                              "Owner denied access after reviewing Gate security context.",
                            )
                          }
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Decline
                        </Button>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Recorded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
