#!/usr/bin/env bash
# ============================================================================
# enable-authentik-provider.sh
# Enciende "authentik" como provider del login OPERATOR (fenrir-bridge).
# Cambio quirúrgico, idempotente y fail-closed: los botones NO aparecen hasta
# que se binden AUTHENTIK_* + AUTHENTIK_ENABLED=true en Cloudflare.
#
# Qué toca exactamente:
#   1) functions/_lib/oauth.ts  : isOAuthProvider() gana  'authentik'
#   2) functions/api/auth/providers.ts : CLIENT_AUTH_PROVIDERS gana 'authentik'
#
# No mergea, no pushea, no despliega. Solo edita y corre typecheck + tests.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

OAUTH="functions/_lib/oauth.ts"
PROVIDERS="functions/api/auth/providers.ts"

backup() {
  local f="$1"
  if [ ! -f "$f.authentik-bak" ]; then
    cp "$f" "$f.authentik-bak"
    echo "✓ backup: $f → $f.authentik-bak"
  else
    echo "• backup ya existía, se conserva: $f.authentik-bak"
  fi
}
backup "$OAUTH"
backup "$PROVIDERS"

# --- 1) isOAuthProvider(): añadir authentic al lado operator ---------------
python3 - "$OAUTH" <<'PY'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = 'return value === "google" || value === "microsoft" || value === "apple";'
new = 'return value === "google" || value === "microsoft" || value === "apple" || value === "authentik";'
if old in src:
    src = src.replace(old, new, 1)
    open(p, "w", encoding="utf-8").write(src)
    print("✓ oauth.ts : isOAuthProvider() ahora incluye 'authentik'")
elif new in src:
    print("• oauth.ts : ya incluía 'authentik' (idempotente)")
else:
    print("✗ oauth.ts : NO encontré la línea esperada — revisa a mano")
    sys.exit(1)
PY

# --- 2) CLIENT_AUTH_PROVIDERS: añadir authentic ----------------------------
python3 - "$PROVIDERS" <<'PY'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = 'const CLIENT_AUTH_PROVIDERS = [\n  "apple",\n  "google",\n  "microsoft",\n'
new = 'const CLIENT_AUTH_PROVIDERS = [\n  "apple",\n  "google",\n  "microsoft",\n  "authentik",\n'
if old in src:
    src = src.replace(old, new, 1)
    open(p, "w", encoding="utf-8").write(src)
    print("✓ providers.ts : CLIENT_AUTH_PROVIDERS ahora incluye 'authentik'")
elif '  "authentik",' in src:
    print("• providers.ts : ya incluía 'authentik' (idempotente)")
else:
    print("✗ providers.ts : no coincidió el bloque — revisa a mano")
    sys.exit(1)
PY

echo ""
echo "--- diff resultante ---"
git --no-pager diff -- "$OAUTH" "$PROVIDERS"

echo ""
echo "--- typecheck ---"
npx tsc --noEmit 2>&1 | tail -20 || true

echo ""
echo "--- tests de oauth ---"
npx vitest run functions/__tests__/community-oauth.test.ts 2>&1 | tail -15 || true

echo ""
echo "✓ Listo. Revisa el diff. Para revertir: 'git checkout -- $OAUTH $PROVIDERS'"
echo "  (backups en *.authentik-bak)"
