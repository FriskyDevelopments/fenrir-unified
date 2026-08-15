import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionFromSupabaseToken,
  defaultSupabaseAnonKey,
  defaultSupabaseUrl,
} from "../_lib/supabase";

afterEach(() => vi.restoreAllMocks());

describe("Supabase session exchange", () => {
  it("uses the public frontend defaults when Pages preview variables are absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "supabase-user",
          email: "member@example.com",
          user_metadata: { full_name: "Fenrir Member" },
          app_metadata: { provider: "apple" },
        }),
        { status: 200 },
      ),
    );

    const session = await createSessionFromSupabaseToken("access-token", {});

    expect(session).toMatchObject({
      email: "member@example.com",
      name: "Fenrir Member",
      provider: "apple",
    });
    expect(fetchMock).toHaveBeenCalledWith(`${defaultSupabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: defaultSupabaseAnonKey,
        Authorization: "Bearer access-token",
      },
    });
  });

  it("keeps explicit environment overrides for other deployments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "user", email: "member@example.com" }), { status: 200 }),
    );

    await createSessionFromSupabaseToken("access-token", {
      SUPABASE_URL: "https://preview.supabase.co/",
      SUPABASE_ANON_KEY: "preview-key",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://preview.supabase.co/auth/v1/user", {
      headers: {
        apikey: "preview-key",
        Authorization: "Bearer access-token",
      },
    });
  });
});
