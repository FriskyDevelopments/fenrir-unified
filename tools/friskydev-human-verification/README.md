# FriskyDEV Human Verification

Canonical privacy-safe human-check for FriskyDEV applications.

Order of methods:

1. ALTCHA proof of work
2. Signal Slider fallback
3. Rune puzzle alternative

Application handoffs are allowed only for explicitly listed origins. Every
proof is signed, expires after five minutes, and is bound to both the consuming
application origin and a per-attempt context. Applications must validate the
grant server-to-server through `POST /api/grant/verify`; a browser query flag is
never authentication or verification proof.

Community Bridge Quality is the first consumer. Production origins are not
allowlisted by this change.

Run the protocol tests with:

```sh
node --test test/*.test.mjs
```
