import { signInWithSupabase } from "./supabaseAuth";

export type AuthProvider = "apple" | "google" | "microsoft";
export type AuthMode = "frisky-client" | "fenrir-community";

export type AuthEngine = {
  mode: AuthMode;
  label: string;
  supportsOAuth: boolean;
  signInWithProvider: (provider: AuthProvider) => Promise<void>;
};

export const friskyClientAuthEngine: AuthEngine = {
  mode: "frisky-client",
  label: "Frisky Dev client auth",
  supportsOAuth: true,
  signInWithProvider(provider) {
    // HARD RULE: login is Supabase signInWithOAuth on the canonical MyFenrir
    // project (yqevglppbhuoxxfsfnih). No external auth broker may ever be
    // routed here — banned, same status as Vercel; it keeps regressing in.
    return signInWithSupabase(provider);
  }
};

export const neonCommunityAuthEngine: AuthEngine = {
  mode: "fenrir-community",
  label: "Fenrir Community Gate Neon auth",
  supportsOAuth: false,
  async signInWithProvider() {
    throw new Error("neon_magic_link_auth_only");
  }
};
