import { readSession } from "../../_lib/auth";
import type { BillingEnv } from "../../_lib/billing-env";
import { addAudit } from "../../_lib/product-db";
import { noStoreJson } from "../../_lib/responses";
import {
  domainSearchCandidates,
  frontDoorCandidates,
  promisingResults,
  rankResults,
  searchDomains
} from "../../../shared/domain-search";

const MAX_CANDIDATES = 30;

type SearchBody = {
  seed?: unknown;
  /** "front-door" fans a brand word into prefix/suffix/TLD variants; "exact" checks what was typed. */
  mode?: unknown;
  candidates?: unknown;
  limit?: unknown;
};

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });

  const body = await context.request.json<SearchBody>().catch(() => null);
  const seed = typeof body?.seed === "string" ? body.seed : "";
  const mode = body?.mode === "front-door" ? "front-door" : "exact";
  const limit = Math.min(MAX_CANDIDATES, Math.max(1, Number(body?.limit) || 12));

  const explicit = Array.isArray(body?.candidates)
    ? body.candidates.filter((entry): entry is string => typeof entry === "string")
    : [];

  const candidates = (
    explicit.length
      ? explicit
      : mode === "front-door"
        ? frontDoorCandidates(seed, { limit })
        : domainSearchCandidates(seed)
  ).slice(0, limit);

  if (!candidates.length) {
    return noStoreJson(
      { ok: false, error: "no_candidates", message: "Enter a brand word or a full domain first." },
      { status: 400 }
    );
  }

  const results = rankResults(await searchDomains(candidates, { concurrency: 6 }));
  const promising = promisingResults(results);

  // Best-effort trail; a read-only lookup must not fail because auditing is unavailable.
  if (context.env.DB) {
    context.waitUntil(
      addAudit(context.env.DB, session, "domain_search_ran", "FriskyDomain", "live-search", {
        seed: seed.slice(0, 64),
        mode,
        checked: results.length,
        promising: promising.length
      }).catch(() => undefined)
    );
  }

  return noStoreJson({
    ok: true,
    mode,
    checked: results.length,
    results,
    /** Names the wizard should offer to register — clean, buyable front doors. */
    promising: promising.map((result) => result.domain),
    checkedAt: new Date().toISOString()
  });
};
