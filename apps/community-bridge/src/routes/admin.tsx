import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  listUsersWithRoles,
  adminUpdateUserRole,
  adminSetUserTelegramId,
} from "@/lib/admin.functions";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { RequireAuth } from "@/components/auth/require-auth";
import { formatAuthError } from "@/lib/auth-errors";
import { ArrowLeft, Loader2, Save, X } from "lucide-react";
import { CourtesyPanel } from "@/components/admin/courtesy-panel";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — MyFenrir" },
      {
        name: "description",
        content:
          "Staff-only MyFenrir admin console for reviewing portal members, assigning roles and managing Telegram links.",
      },
      { property: "og:title", content: "Admin console — MyFenrir" },
      {
        property: "og:description",
        content: "Manage MyFenrir portal members, roles and Telegram links.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${getSiteUrl()}/admin` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/admin` }],
  }),
  component: AdminPage,
});

interface UserRow {
  user_id: string;
  email: string;
  role: AppRole;
  telegram_id: number | null;
  created_at: string;
}

function AdminPage() {
  return (
    <RequireAuth>
      <AdminConsole />
    </RequireAuth>
  );
}

function AdminConsole() {
  const { isOwner, user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [tgDrafts, setTgDrafts] = useState<Record<string, string>>({});
  const effectiveOwner =
    isOwner || rows?.some((row) => row.user_id === user?.id && row.role === "owner") === true;

  const fetchUsers = useServerFn(listUsersWithRoles);
  const updateRole = useServerFn(adminUpdateUserRole);
  const setTelegram = useServerFn(adminSetUserTelegramId);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await fetchUsers();
      setRows(list);
      setTgDrafts(
        Object.fromEntries(list.map((r) => [r.user_id, r.telegram_id ? String(r.telegram_id) : ""])),
      );
    } catch (err) {
      setLoadError(formatAuthError(err instanceof Error ? err.message : String(err)));
      setRows([]);
    }
  }, [fetchUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  function showFlash(kind: "ok" | "err", msg: string) {
    setFlash({ kind, msg });
    window.setTimeout(() => setFlash(null), 3500);
  }

  async function changeRole(row: UserRow, next: AppRole) {
    if (next === row.role) return;
    if (row.user_id === user?.id && row.role === "owner" && next !== "owner") {
      showFlash("err", "You can't demote yourself.");
      return;
    }
    setBusyId(row.user_id);
    try {
      await updateRole({ data: { target: row.user_id, role: next } });
      showFlash("ok", `Role updated for ${row.email}.`);
      void load();
    } catch (err) {
      showFlash("err", formatAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyId(null);
    }
  }

  async function saveTelegram(row: UserRow) {
    const raw = (tgDrafts[row.user_id] ?? "").trim();
    let value: number | null = null;
    if (raw !== "") {
      if (!/^\d+$/.test(raw)) {
        showFlash("err", "Telegram ID must be digits only.");
        return;
      }
      value = Number(raw);
      if (!Number.isSafeInteger(value)) {
        showFlash("err", "Telegram ID is out of range.");
        return;
      }
    }
    setBusyId(row.user_id);
    try {
      await setTelegram({ data: { target: row.user_id, telegramId: value } });
      showFlash("ok", value === null ? `Telegram link cleared for ${row.email}.` : `Linked ${row.email}.`);
      void load();
    } catch (err) {
      showFlash("err", formatAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-lg font-semibold tracking-tight">
              <span className="text-foreground">Clips</span>
              <span className="text-primary">Flow</span>
              <span className="ml-2 text-sm font-normal text-muted-foreground">Admin</span>
            </div>
          </div>
          <Badge variant={isOwner ? "default" : "secondary"}>{isOwner ? "Owner" : "Admin"}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {isOwner && rows ? <CourtesyPanel users={rows} /> : null}
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage roles and Telegram links across the portal.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>

        {flash && (
          <div
            role="status"
            className={`mb-4 rounded-md border p-3 text-sm ${
              flash.kind === "ok"
                ? "border-primary/40 bg-primary/10 text-primary-foreground"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
          >
            {flash.msg}
          </div>
        )}

        {loadError && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="w-[160px]">Role</TableHead>
                <TableHead className="w-[280px]">Telegram ID</TableHead>
                <TableHead className="w-[160px]">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {rows && rows.length === 0 && !loadError && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No users yet.
                  </TableCell>
                </TableRow>
              )}
              {rows?.map((row) => {
                const canEditOwner = effectiveOwner || row.role !== "owner";
                const draft = tgDrafts[row.user_id] ?? "";
                const draftDirty = draft !== (row.telegram_id ? String(row.telegram_id) : "");
                return (
                  <TableRow key={row.user_id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{row.email}</div>
                      <div className="text-xs text-muted-foreground">{row.user_id}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.role}
                        disabled={!canEditOwner || busyId === row.user_id}
                        onValueChange={(v) => void changeRole(row, v as AppRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="owner" disabled={!effectiveOwner}>
                            Owner
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          inputMode="numeric"
                          placeholder="Not linked"
                          value={draft}
                          disabled={!canEditOwner || busyId === row.user_id}
                          onChange={(e) =>
                            setTgDrafts((d) => ({ ...d, [row.user_id]: e.target.value }))
                          }
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          disabled={!canEditOwner || !draftDirty}
                          loading={busyId === row.user_id}
                          onClick={() => void saveTelegram(row)}
                          aria-label="Save Telegram ID"
                        >
                          {busyId === row.user_id ? null : <Save className="h-4 w-4" />}
                        </Button>
                        {row.telegram_id && canEditOwner && (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={busyId === row.user_id}
                            onClick={() => {
                              setTgDrafts((d) => ({ ...d, [row.user_id]: "" }));
                            }}
                            aria-label="Clear Telegram ID input"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
