# Better Auth cutover — 30 amendments

Source: production cutover note pasted in review.
Date: 2026-09-02
Applies to: `docs/BETTER_AUTH_CENTRAL_IDENTITY_CUTOVER.md` v1.1

1. Add owner, version, last-reviewed date.
2. Close the truncated rollback sentence; leave `app_auth_*` tables in place.
3. State purpose and non-goals (no workspace RBAC, billing, Gate membership, KYC).
4. Document `fenrir_session` flags: HttpOnly, Secure, SameSite=Lax, host-only, TTL.
5. Document session / access / refresh lifetimes and expiry behavior.
6. Lock OIDC scopes to `openid email profile`.
7. Name social providers: Google, Microsoft. Buttons only if id+secret exist.
8. Email match: lowercase normalize; do not auto-merge plus-aliases.
9. PKCE S256 is MUST; reject token requests without a valid verifier.
10. JWKS rotation with key overlap and cache headers.
11. Env table for `BETTER_AUTH_ENABLED`, migration flag, and migration token.
12. Health / readiness contract for the auth handler.
13. No tokens, codes, or migration token in logs.
14. Rate-limit sign-in, authorize, and token.
15. Closed redirect-URI allowlist; reject open redirects.
16. Rollback RTO and verification that the direct Google/Microsoft rail is back.
17. Staging must repeat discovery, JWKS, and one test provider.
18. LibreChat is a confidential OIDC client; secret stays out of the doc.
19. Community Gate: identity starts at Better Auth; membership stays in Gate.
20. Authentik stays offline; not a fallback; do not re-enable.
21. Migration token is one-shot, secret-manager only, rotate after bootstrap.
22. Verify `fenrir_session` is minted after provider sign-in.
23. Negative test: token endpoint returns 400 without PKCE; codes are one-time.
24. Alert on handler 5xx, discovery/JWKS down, sign-in success-rate drop.
25. Threat notes: refresh theft, issuer mix-up, open redirect, code reuse.
26. Retention of `app_auth_*`; do not touch billing / Gate / Supabase / legacy users.
27. LFPDPPP: identity data used for authentication only.
28. Document JWT clock-skew tolerance across issuer and clients.
29. Break-glass path that does not turn Authentik on.
30. Changelog v1.1; Google/Microsoft direct rail is temporary.
