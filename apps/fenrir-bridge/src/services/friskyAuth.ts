import { createFriskyAuthClient, type FriskySocialProvider } from "@frisky/auth/client";
import { isSafeRedirectPath } from "./supabaseAuth";

export type AppAuthProvider = FriskySocialProvider;

/**
 * Resolves the requested post-authentication return path.
 *
 * @returns The single-slash-relative `next` path, or `/main` when the requested path is invalid or absent.
 */
function safeReturnPath() {
  const requested = new URLSearchParams(window.location.search).get("next");
  if (isSafeRedirectPath(requested)) return requested as string;
  return "/main";
}

/**
 * Starts social sign-in with Frisky authentication.
 *
 * @param provider - The social authentication provider to use
 * @throws An error if the sign-in request fails
 */
export async function signInWithFriskyAuth(provider: AppAuthProvider) {
  const client = createFriskyAuthClient();
  const { error } = await client.signIn.social({
    provider,
    callbackURL: `${window.location.origin}${safeReturnPath()}`,
  });
  if (error) throw new Error(error.message || "frisky_auth_sign_in_failed");
}

/**
 * Signs out the current Frisky authentication session when possible.
 */
export async function signOutFriskyAuthClient() {
  try {
    const client = createFriskyAuthClient();
    await client.signOut();
  } catch {
    // Fenrir cookie logout still proceeds.
  }
}
