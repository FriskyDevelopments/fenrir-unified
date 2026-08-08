import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Loader2, ShieldQuestion, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequireRole } from "@/components/auth/require-auth";
import {
  decideModerationReview,
  listModerationReviews,
  type ModerationReview,
  type ReviewStatus,
} from "@/lib/moderation.functions";

/**
 * Cola de revisión humana.
 *
 * Aquí solo llega la DUDA del clasificador. Lo que quedó claramente por debajo
 * del mínimo de edad se bloqueó de inmediato y nunca entró a esta pantalla:
 * nadie tiene que mirar eso para decidir algo que ya está decidido.
 */

export const Route = createFileRoute("/moderation")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Moderation queue — MyFenrir" },
      {
        name: "description",
        content: "Staff-only review queue for images the classifier could not decide on its own.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ModerationPage,
});

const REASON_LABEL: Record<string, string> = {
  no_age_reading: "No age reading",
  age_near_threshold: "Age near threshold",
  reported: "Reported",
  other: "Other",
};

const TABS: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function ModerationPage() {
  return (
    <RequireRole roles={["owner", "admin"]}>
      <ModerationQueue />
    </RequireRole>
  );
}

function ModerationQueue() {
  const load = useServerFn(listModerationReviews);
  const decide = useServerFn(decideModerationReview);

  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [rows, setRows] = useState<ModerationReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(
    async (next: ReviewStatus) => {
      setLoading(true);
      try {
        setRows(await load({ data: { status: next, limit: 100 } }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load the queue");
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    void refresh(status);
  }, [refresh, status]);

  async function resolve(row: ModerationReview, decision: "approved" | "rejected") {
    setBusyId(row.id);
    try {
      const result = await decide({
        data: { id: row.id, decision, note: notes[row.id]?.trim() || undefined },
      });
      if (result.alreadyDecided) {
        toast.message("Someone else already resolved this one.");
      } else {
        toast.success(decision === "approved" ? "Approved" : "Rejected");
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the decision");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Moderation queue</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Only what the classifier could not decide on its own lands here. Anything clearly
              below the minimum age was blocked on the spot and never reaches this screen.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {TABS.map((tab) => (
              <Button
                key={tab.value}
                size="sm"
                variant={status === tab.value ? "secondary" : "ghost"}
                onClick={() => setStatus(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-border py-20 text-center">
            <ShieldQuestion className="h-8 w-8 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium text-foreground">
              {status === "pending" ? "Nothing waiting on a human" : "Nothing here"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {status === "pending"
                ? "The classifier resolved everything on its own."
                : "No items with this status yet."}
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Why it is here</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Waiting since</TableHead>
                  {status === "pending" && <TableHead className="text-right">Decision</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant={row.reason === "no_age_reading" ? "destructive" : "secondary"}>
                        {REASON_LABEL[row.reason] ?? row.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      <p className="truncate font-mono text-xs text-foreground" title={row.subject_ref}>
                        {row.subject_ref}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {row.subject_kind} · {row.community_id}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>Apparent age: {row.apparent_age ?? "—"}</div>
                      <div>Explicit: {row.explicit === null ? "—" : row.explicit ? "yes" : "no"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    {status === "pending" && (
                      <TableCell>
                        <div className="flex flex-col items-end gap-2">
                          <Input
                            placeholder="Note (optional)"
                            className="h-8 max-w-[16rem] text-xs"
                            value={notes[row.id] ?? ""}
                            onChange={(event) =>
                              setNotes((current) => ({ ...current, [row.id]: event.target.value }))
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === row.id}
                              onClick={() => resolve(row, "approved")}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === row.id}
                              onClick={() => resolve(row, "rejected")}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
