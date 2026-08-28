import { createFriskyAuthClient, type FriskySocialProvider } from "@frisky/auth/client";

export type AppAuthProvider = FriskySocialProvider;

function safeReturnPath() {
  const requested = new URLSearchParams(window.location.search).get("next");
  if (requested?.startsWith("/") && !requested.startsWith("//")) return requested;
  return "/main";
}

export async function signInWithFriskyAuth(provider: AppAuthProvider) {
  const client = createFriskyAuthClient();
  const { error } = await client.signIn.social({
    provider,
    callbackURL: `${window.location.origin}${safeReturnPath()}`,
  });
  if (error) throw new Error(error.message || "frisky_auth_sign_in_failed");
}

export async function signOutFriskyAuthClient() {
  try {
    const client = createFriskyAuthClient();
    await client.signOut();
  } catch {
    // Fenrir cookie logout still proceeds.
  }
}
