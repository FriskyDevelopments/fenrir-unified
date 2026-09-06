import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../api/auth/community-sso";

describe("Community handoff", () => {
  afterEach(() => vi.restoreAllMocks());
  it("starts Community login carrying the requested Gate and never mints a shared session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({
      request: new Request(
        "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fg%2Ffrs",
        { headers: { Cookie: "fenrir_session=main-only; sb-project-auth-token=community-only" } },
      ),
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/g/frs");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an external navigation target", async () => {
    const response = await onRequestGet({
      request: new Request("https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fevil.example%2F"),
    });
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });
  it("carries the brand and source Gate through the navigation handoff", async () => {
    const response = await onRequestGet({ request: new Request("https://myfenrir.com/api/auth/community-sso?next=%2Fg%2Ffrs&brand=lore&gate=frs") });
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("brand")).toBe("lore");
    expect(location.searchParams.get("gate")).toBe("frs");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
