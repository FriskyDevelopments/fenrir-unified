import { useState } from "react";
import { BadgeCheck, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TelegramIdentity {
  id: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
}

function initials(identity: TelegramIdentity): string {
  const name = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("");
  }
  return (identity.username ?? "TG").slice(0, 2).toUpperCase();
}

export function TelegramIdentityCard({
  identity,
  className,
  note,
}: {
  identity: TelegramIdentity;
  className?: string;
  note?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const displayName =
    [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim() ||
    (identity.username ? `@${identity.username}` : "Telegram account");

  return (
    <Card variant="muted" className={cn("p-4", className)}>
      <div className="flex items-center gap-3">
        <div className="relative">
          {identity.photoUrl && !imgFailed ? (
            <img
              src={identity.photoUrl}
              alt={`${displayName} Telegram profile picture`}
              width={48}
              height={48}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-12 w-12 rounded-full border border-border/60 bg-background object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-primary/10 text-sm font-semibold text-primary">
              {initials(identity)}
            </div>
          )}
          <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5">
            <BadgeCheck className="h-4 w-4 text-primary" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <MessageCircle className="h-3 w-3" />
              Linked
            </span>
          </div>
          {identity.username && (
            <p className="truncate text-xs text-muted-foreground">@{identity.username}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Telegram ID {identity.id}
          </p>
          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </div>
      </div>
    </Card>
  );
}
