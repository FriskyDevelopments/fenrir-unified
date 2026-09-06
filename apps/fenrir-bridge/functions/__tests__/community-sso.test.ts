import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../api/auth/community-sso";

describe("Community handoff", () => {
  it("only navigates to the requested Community route and never mints a shared session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({
      request: new Request(
        "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fg%2Ffrs",
        { headers: { Cookie: "fenrir_session=main-only; sb-project-auth-token=community-only" } },
      ),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://communities.myfenrir.com/g/frs");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an external navigation target", async () => {
    const response = await onRequestGet({
      request: new Request("https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fevil.example%2F"),
    });
    expect(response.headers.get("location")).toBe("https://communities.myfenrir.com/dashboard");
  });
});
