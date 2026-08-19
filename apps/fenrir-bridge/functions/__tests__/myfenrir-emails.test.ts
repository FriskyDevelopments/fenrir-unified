import { afterEach, describe, expect, it, vi } from "vitest";
import { emailLocaleFromTelegram, sendMyFenrirEmail } from "../_lib/myfenrir-emails";

it("maps Telegram language codes to supported email locales", () => {
  expect(emailLocaleFromTelegram("es-MX")).toBe("es");
  expect(emailLocaleFromTelegram("fr")).toBe("fr");
  expect(emailLocaleFromTelegram("de-DE")).toBe("de");
  expect(emailLocaleFromTelegram("pt-BR")).toBe("en");
});

afterEach(() => vi.unstubAllGlobals());

describe("sendMyFenrirEmail", () => {
  it("posts the branded template contract to the dedicated Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      provider: "cloudflare",
      id: "cf-message-id",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMyFenrirEmail({
      MYFENRIR_EMAILS_URL: "https://emails.myfenrir.com/",
      MYFENRIR_EMAILS_TOKEN: "worker-token",
    }, {
      template: "acceso",
      to: "qa@example.com",
      data: { url: "https://myfenrir.com/main", minutos: 15 },
    });

    expect(result).toEqual({ ok: true, via: "worker", provider: "cloudflare", id: "cf-message-id" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://emails.myfenrir.com/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer worker-token");
    expect(JSON.parse(String(init.body))).toMatchObject({
      template: "acceso",
      to: "qa@example.com",
      brand: "myfenrir",
      locale: "en",
    });
  });

  it("does not report success when the Worker rejects delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: "Unauthorized",
    }), { status: 401, headers: { "Content-Type": "application/json" } })));

    const result = await sendMyFenrirEmail({ MYFENRIR_EMAILS_URL: "https://emails.myfenrir.com" }, {
      template: "bienvenida",
      to: "qa@example.com",
    });

    expect(result).toEqual({ ok: false, via: "worker", error: "Unauthorized" });
  });

  it("uses the private service binding when Pages has no direct send_email binding", async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await sendMyFenrirEmail({
      EMAIL: { fetch: bindingFetch },
    }, {
      template: "acceso",
      to: "qa@example.com",
      data: { url: "https://myfenrir.com/main", minutos: 15 },
    });

    expect(result).toEqual({ ok: true, via: "binding" });
    expect(bindingFetch).toHaveBeenCalledOnce();
    const [request] = bindingFetch.mock.calls[0] as [Request];
    expect(request.url).toBe("https://email.internal/send");
    expect(request.method).toBe("POST");
    expect(await request.json()).toMatchObject({
      to: "qa@example.com",
      from: { email: "noreply@mail.myfenrir.com", name: "MyFenrir" },
    });
  });
});
