#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVICE="${FENRIR_GCLOUD_SERVICE:-fenrir-bridge}"
PROJECT="${GCP_PROJECT:-${GOOGLE_CLOUD_PROJECT:-gen-lang-client-0202582192}}"
REGION="${GCP_REGION:-${GOOGLE_CLOUD_REGION:-us-central1}}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required for Fenrir Bridge Cloud Run deploys." >&2
  exit 1
fi

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

required_vars=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
)

for key in "${required_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required build env: $key" >&2
    echo "Set it in .env.local or export it before running this script." >&2
    exit 1
  fi
done

build_env_vars=(
  "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}"
  "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}"
  "VITE_AUTH_REDIRECT_ORIGIN=${VITE_AUTH_REDIRECT_ORIGIN:-}"
  "VITE_AUTH_REDIRECT_PATH=${VITE_AUTH_REDIRECT_PATH:-/auth/callback}"
  "VITE_FENRIR_MANAGED_URL=${VITE_FENRIR_MANAGED_URL:-https://www.myfenrir.com/main}"
  "VITE_CUSTOM_DOMAIN_URL=${VITE_CUSTOM_DOMAIN_URL:-}"
  "VITE_DEFAULT_SERVICE_ORG=${VITE_DEFAULT_SERVICE_ORG:-Frisky Dev Workspace}"
  "VITE_DEFAULT_SERVICE_SUBDOMAIN=${VITE_DEFAULT_SERVICE_SUBDOMAIN:-vip.myfenrir.com}"
)

printf "Fenrir Bridge Cloud Run deploy\n"
printf "  service: %s\n" "$SERVICE"
printf "  project: %s\n" "$PROJECT"
printf "  region:  %s\n" "$REGION"

npm run typecheck
npm run build

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 80 \
  --set-build-env-vars "$(IFS=,; echo "${build_env_vars[*]}")"

service_url="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --format='value(status.url)')"

printf "Fenrir Bridge Cloud Run URL: %s\n" "$service_url"
