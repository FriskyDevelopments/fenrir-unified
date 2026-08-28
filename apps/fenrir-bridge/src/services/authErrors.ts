export const AUTH_ERROR_CODES = [
  "provider_error",
  "missing_code_or_state",
  "invalid_or_expired_state",
  "state_provider_mismatch",
  "token_exchange_failed",
  "profile_fetch_failed",
  "no_subject_in_profile",
  "session_create_failed",
  "unknown_provider",
  "unknown",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * Determines whether a value is a supported authentication error code.
 *
 * @param value - The value to check
 * @returns `true` if the value is a supported authentication error code, `false` otherwise.
 */
function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Parses a raw authentication error value into a supported error code.
 *
 * @param raw - The raw authentication error value
 * @returns The recognized authentication error code, `unknown` for unsupported or explicitly unknown values, or `null` when no value is provided
 */
export function parseAuthError(raw: string | null | undefined): AuthErrorCode | null {
  if (!raw) return null;
  if (isAuthErrorCode(raw) && raw !== "unknown") return raw;
  return "unknown";
}

/**
 * Maps an authentication error code to a user-facing message.
 *
 * @param code - The authentication error code to describe
 * @returns A user-facing message for the error code
 */
export function authErrorCopy(code: AuthErrorCode): string {
  switch (code) {
    case "provider_error":
      return "The provider denied or cancelled access. Try again and confirm consent.";
    case "missing_code_or_state":
      return "The sign-in response was incomplete. Return to this screen and try again.";
    case "invalid_or_expired_state":
      return "The sign-in session expired. Try again from this screen.";
    case "state_provider_mismatch":
      return "The sign-in provider did not match. Return to this screen and try again.";
    case "token_exchange_failed":
      return "Could not exchange the sign-in code. Please try again.";
    case "profile_fetch_failed":
      return "Could not read your profile from the provider. Please try again.";
    case "no_subject_in_profile":
      return "The provider did not return a usable identity.";
    case "session_create_failed":
      return "Your identity was validated, but Fenrir could not create a session.";
    case "unknown_provider":
      return "That sign-in provider is not available.";
    case "unknown":
      return "Sign-in could not finish. Try another provider or refresh the page.";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * Converts a legacy authentication error into a user-facing message.
 *
 * @param error - A legacy colon-delimited authentication error, if present
 * @returns The corresponding message, or `null` when no message should be shown
 */
export function legacyAuthErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  const [errorCode, errorDetail] = error.split(":", 2);
  const detail = errorDetail ? decodeURIComponent(errorDetail) : "";

  if (error.startsWith("missing_env:")) {
    return "This provider is not live yet. Use an enabled sign-in option, or refresh to return to the clean Fenrir gate.";
  }
  if (error === "direct_oauth_disabled") {
    return "That old sign-in route was retired. Use the provider buttons on this Fenrir gate.";
  }
  if (errorCode === "oauth_access_denied") {
    return "The provider denied access. Try again and confirm consent to continue with this account.";
  }
  if (errorCode === "oauth_callback_error") {
    return `Provider error while returning from sign-in.${detail ? ` ${detail}` : ""}`;
  }
  if (errorCode === "code_exchange_failed") {
    return `Could not exchange the OAuth callback code. ${detail ? `(${detail})` : "Please try again."}`;
  }
  if (errorCode === "session_lookup_failed") {
    return `Could not read the Frisky login session after login. ${detail ? `(${detail})` : "Please retry from the sign-in screen."}`;
  }
  if (errorCode === "supabase_session_failed") {
    if (detail === "human_verification_required") return null;
    return `Could not open a Fenrir admin session.${detail ? ` (${detail})` : ""}`;
  }
  if (errorCode === "missing_code") {
    return "The provider did not return a sign-in code. Please try again.";
  }
  return "Sign-in could not finish. Try another provider or refresh the page.";
}

/**
 * Resolves the user-facing authentication error message from login-page query parameters.
 *
 * @param search - The login-page query string, with or without a leading question mark
 * @returns The message for the recognized authentication error, or `null` when no error is present
 */
export function loginPageErrorMessage(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const workerError = parseAuthError(params.get("error"));
  if (workerError) return authErrorCopy(workerError);
  return legacyAuthErrorMessage(params.get("auth_error"));
}
