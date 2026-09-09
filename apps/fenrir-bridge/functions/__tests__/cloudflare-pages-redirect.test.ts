import { afterEach, expect, it, vi } from "vitest";
import { attachPagesDomain, findZoneOnAccount } from "../_lib/cloudflare-pages-domain";

afterEach(() => vi.unstubAllGlobals());

it.each([301, 302, 303, 307, 308])("rejects Cloudflare HTTP %s without following credentials or creating a hostname", async (status) => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(init?.redirect).toBe("manual");
    return Response.json({ success: true, result: { id: "fixture", name: "vip.example.com", status: "active" } }, {
      status, headers: { Location: "https://untrusted.example/api" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(attachPagesDomain("fixture-token", "fixture-account", "fixture-project", "vip.example.com")).rejects.toThrow("cloudflare_unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]?.method).not.toBe("POST");
  await expect(findZoneOnAccount("fixture-token", "fixture-account", "vip.example.com")).rejects.toThrow("cloudflare_unavailable");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
