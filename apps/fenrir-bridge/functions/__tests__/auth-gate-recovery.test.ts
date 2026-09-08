import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const mocks = vi.hoisted(() => ({ me: vi.fn(), setState: vi.fn() }));
vi.mock("../../src/services/api", () => ({ authService: { me: mocks.me } }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  // Inspect the real gate callback without needing a browser renderer.
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, mocks.setState],
  useEffect: () => undefined,
  useCallback: (callback: unknown) => callback,
}));

import { AuthGate } from "../../src/routes/authGate";
import { HumanVerificationGate } from "../../src/components/HumanVerificationGate";
import { copy } from "../../src/i18n";

function verificationCallback() {
  const surface = AuthGate({ c: copy.en, locale: "en", onLocale: vi.fn() });
  const card = surface.props.children as ReactElement<{ children: unknown[] }>;
  const verification = card.props.children.find((child) => isValidElement(child) && child.type === HumanVerificationGate);
  return (verification as ReactElement<{ onVerified: (verified: boolean) => void }>).props.onVerified;
}

describe("auth gate session recovery after human verification", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { search: "", assign: vi.fn() } });
    mocks.me.mockReset();
    mocks.setState.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("catches session transport failures and shows recoverable auth feedback", async () => {
    mocks.me.mockRejectedValue(new Error("service_unavailable"));

    verificationCallback()(true);

    await vi.waitFor(() => expect(mocks.setState).toHaveBeenLastCalledWith(copy.en.authProviderError));
    expect(mocks.me).toHaveBeenCalledOnce();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("does not look up a session before human verification succeeds", () => {
    verificationCallback()(false);
    expect(mocks.me).not.toHaveBeenCalled();
  });
});
