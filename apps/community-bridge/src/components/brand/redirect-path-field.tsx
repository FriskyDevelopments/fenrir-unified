/**
 * Redirect path input with live validation.
 *
 * Checks the tenant's post-login / OAuth return path against the app's allowed
 * routes as the admin types, warns when it wouldn't resolve, and offers a
 * one-click fix to the nearest allowed route.
 */

import { AlertTriangle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  ALLOWED_AFTER_LOGIN_PATHS,
  ALLOWED_OAUTH_RETURN_PATHS,
  checkRedirectPath,
} from "@/lib/redirect-validation";

export function RedirectPathField({
  field,
  value,
  onChange,
}: {
  field: "afterLogin" | "oauthReturnPath";
  value: string;
  onChange: (next: string) => void;
}) {
  const issue = checkRedirectPath(field, value);
  const allowed = field === "afterLogin" ? ALLOWED_AFTER_LOGIN_PATHS : ALLOWED_OAUTH_RETURN_PATHS;

  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={allowed[0] ?? "/"}
        aria-invalid={issue ? true : undefined}
        className={issue ? "border-warning/60 focus-visible:ring-warning/50" : undefined}
      />
      {issue ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="space-y-1.5">
            <p>{issue.message}</p>
            {issue.suggestion ? (
              <button
                type="button"
                onClick={() => onChange(issue.suggestion as string)}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Use {issue.suggestion}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Check className="h-3 w-3 text-success" />
          Allowed route for this tenant.
        </p>
      )}
    </div>
  );
}
