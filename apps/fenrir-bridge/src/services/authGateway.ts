import { authService } from "./api";

export type AuthProvider = "apple" | "google" | "microsoft";
export type AuthMode = "frisky-client" | "fenrir-community";

export type AuthEngine = {
  mode: AuthMode;
  label: string;
  supportsOAuth: boolean;
  enabledProviders: () => Promise<AuthProvider[]>;
  signInWithProvider: (provider: AuthProvider) => Promise<void>;
};

export const friskyClientAuthEngine: AuthEngine = {
  mode: "frisky-client",
  label: "Frisky Dev client auth",
  supportsOAuth: true,
  enabledProviders() {
    return authService.enabledProviders();
  },
  signInWithProvider(provider) {
    return authService.login(provider);
  },
};

export const neonCommunityAuthEngine: AuthEngine = {
  mode: "fenrir-community",
  label: "Fenrir Community Gate Neon auth",
  supportsOAuth: false,
  async enabledProviders() {
    return [];
  },
  async signInWithProvider() {
    throw new Error("neon_magic_link_auth_only");
  },
};
