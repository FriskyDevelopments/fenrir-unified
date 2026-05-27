# BugBug Trial -> Frisky MCP Feed

Use the 14-day trial for compact smoke coverage first. Record only suites that catch launch blockers, then let Frisky MCP turn the result packet into repo-specific fixes.

## Safe box fields

Open:

```bash
npm run safe-box
```

Fill:

- `BUGBUG_API_TOKEN`
- `FRISKY_BOT_API_TOKEN` as the unified Frisky service token for MCP/specialist calls
- `BUGBUG_FENRIR_SUITE_ID`
- `BUGBUG_CLIPSFLOW_SUITE_ID`
- `BUGBUG_HOSTOS_SUITE_ID`
- `BUGBUG_FRISKY_GHOST_SUITE_ID`
- `BUGBUG_PROFILE_NAME` if BugBug profiles are used

Leave unknown suites blank. The runner only executes configured suites.

## Trial priority

1. Fenrir Bridge P0: public health, app shell, auth gate, `/api/health`, Telegram/Fenrir paid-access surface.
2. Frisky Ghost P1: public domain loads, login gate, callback route, protected app shell.
3. ClipsFlow P1: public app loads, miniapp route, billing placeholder/gate.
4. HostOS/Lupita P1: Worker health, WhatsApp/Meta setup pages or public surface.

## Run

```bash
npm run bugbug:trial
```

Outputs:

- `artifacts/bugbug/*.junit.xml`
- `artifacts/bugbug/latest-frisky-mcp-packet.json`
- `artifacts/bugbug/latest-frisky-mcp-response.json`

If `FRISKY_BOT_API_TOKEN` is present, the runner posts the packet to `frisky-codex-engineer` through `https://mcp.friskydev.com/consult_specialist`. This is the same server-side Frisky auth pattern used by Frisky-backed bot workflows; Telegram BotFather tokens only cover Telegram transport.

## Notes

- BugBug's API token comes from the BugBug project Integrations tab.
- BugBug CLI supports `bugbug remote run suite <suite-id>` and JUnit output.
- Do not paste tokens into chat or commit `.env.local`.
