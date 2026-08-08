export function formatAuthError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Please try again.";
  const m = message.toLowerCase();
  if (m.includes("provider is not enabled")) {
    return "This sign-in provider is disabled in Supabase. Open Supabase → Authentication → Providers and enable Google, Apple, or Azure (Microsoft).";
  }
  if (m.includes("redirect_uri") || m.includes("redirect uri")) {
    return "OAuth redirect URL isn't allowed. In Supabase → Authentication → URL Configuration, add this origin to Site URL / additional redirect URLs, and register https://<project>.supabase.co/auth/v1/callback in the provider's console.";
  }
  if (m.includes("oauth")) {
    return "OAuth sign-in failed. Verify the provider credentials in Supabase and the callback URL in the provider's console.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("forbidden") || m.includes("42501")) {
    return "You don't have permission to do that.";
  }
  if (m.includes("network")) {
    return "Network error. Check your connection and try again.";
  }
  return message;
}

export function isProviderDisabledError(message: string | undefined | null): boolean {
  return !!message && message.toLowerCase().includes("provider is not enabled");
}
