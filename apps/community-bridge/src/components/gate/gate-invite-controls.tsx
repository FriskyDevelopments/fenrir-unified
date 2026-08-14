import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getGateInvite,
  revokeGateInvite,
  rotateGateInvite,
  type GateInvite,
} from "@/lib/gate-invites.functions";

/** Owner-only controls. Every issued URL is checked by the server before Telegram opens. */
export function GateInviteControls({ gateId }: { gateId: string }) {
  const getInvite = useServerFn(getGateInvite);
  const rotateInvite = useServerFn(rotateGateInvite);
  const revokeInvite = useServerFn(revokeGateInvite);
  const [invite, setInvite] = useState<GateInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void getInvite({ data: { gateId } })
      .then((next) => active && setInvite(next))
      .catch((error: unknown) => active && toast.error(error instanceof Error ? error.message : "Could not load the invite link."));
    return () => { active = false; };
  }, [gateId, getInvite]);

  const copy = async () => {
    if (!invite?.url) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy the invite link.");
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      setInvite(await rotateInvite({ data: { gateId } }));
      toast.success("New link ready. Every earlier invite link is now inactive.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate the invite link.");
    } finally { setBusy(false); }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      setInvite(await revokeInvite({ data: { gateId } }));
      toast.success("This Gate's invite link is revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the invite link.");
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-8 rounded-2xl border border-border/70 bg-card/50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invite link</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">Share, rotate, or revoke</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        This is the only link you need to share. Rotating invalidates every older link; revoking disables this one without deleting the Gate.
      </p>
      {invite?.url ? <p className="mt-4 break-all rounded-lg border border-border bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground">{invite.url}</p> : null}
      {invite?.status === "revoked" ? <p className="mt-4 text-sm text-amber-500">No invite link is active. Rotate to issue a new one.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} disabled={!invite?.url || busy}>
          {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy invite"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void rotate()} disabled={busy}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Rotate link
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void revoke()} disabled={!invite?.url || busy}>
          <Ban className="mr-2 h-3.5 w-3.5" /> Revoke link
        </Button>
      </div>
    </section>
  );
}
