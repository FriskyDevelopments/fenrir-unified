#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-fenrir-bridge}"
GCP_PROJECT="${GCP_PROJECT:-}"
OP_VAULT="${OP_VAULT:-Private}"
OP_ITEM="${OP_ITEM:-Fenrir Alpha Secrets}"
ENVIRONMENT="${ENVIRONMENT:-production}"

REQUIRED_SECRETS=(
  "SESSION_SECRET"
  "SUPABASE_URL"
  "SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "NEON_DATABASE_URL"
  "FENRIR_COMMUNITY_AUTH_SECRET"
  "TELEGRAM_BOT_TOKEN"
  "TELEGRAM_PROD_BOT_TOKEN"
  "FENRIR_TELEGRAM_BOT_USERNAME"
  "TELEGRAM_WEBHOOK_SECRET"
  "FRISKY_BOT_API_TOKEN"
)

OPTIONAL_SECRETS=(
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "STRIPE_STARTER_PRICE_ID"
  "STRIPE_PRO_PRICE_ID"
  "STRIPE_OPERATOR_PRICE_ID"
)

declare -A VALUES

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

read_secret() {
  local key="$1"
  local required="${2:-required}"
  local value=""
  while [[ -z "$value" ]]; do
    if [[ "$required" == "optional" ]]; then
      printf "%s (optional, Enter to skip): " "$key" >&2
    else
      printf "%s: " "$key" >&2
    fi
    stty -echo
    IFS= read -r value
    stty echo
    printf "\n" >&2
    if [[ "$required" == "optional" && -z "$value" ]]; then
      return
    fi
    if [[ -z "$value" ]]; then
      printf "Value cannot be empty.\n" >&2
    fi
  done
  VALUES["$key"]="$value"
}

put_cloudflare_pages_secret() {
  local key="$1"
  local value="$2"
  printf "%s" "$value" | env -u CLOUDFLARE_API_TOKEN WRANGLER_SEND_METRICS=false deno run -A npm:wrangler@4.90.0 pages secret put "$key" \
    --project-name "$PROJECT_NAME" \
    --env "$ENVIRONMENT" >/dev/null
}

put_gcp_secret() {
  local key="$1"
  local value="$2"
  local project_args=()
  if [[ -n "$GCP_PROJECT" ]]; then
    project_args=(--project "$GCP_PROJECT")
  fi

  if gcloud secrets describe "$key" "${project_args[@]}" >/dev/null 2>&1; then
    printf "%s" "$value" | gcloud secrets versions add "$key" "${project_args[@]}" --data-file=- >/dev/null
  else
    printf "%s" "$value" | gcloud secrets create "$key" "${project_args[@]}" --replication-policy=automatic --data-file=- >/dev/null
  fi
}

ensure_1password_item() {
  if op item get "$OP_ITEM" --vault "$OP_VAULT" >/dev/null 2>&1; then
    return
  fi
  op item create --category secure-note --title "$OP_ITEM" --vault "$OP_VAULT" >/dev/null
}

put_1password_secret() {
  local key="$1"
  local value="$2"
  op item edit "$OP_ITEM" --vault "$OP_VAULT" "${key}[password]=$value" >/dev/null
}

printf "Fenrir alpha secret intake\n" >&2
printf "Targets: Cloudflare Pages, Google Secret Manager, 1Password\n" >&2
printf "Launch path: Telegram Stars + D1. Stripe/Card secrets are optional standby.\n" >&2
printf "Values are hidden while typing and are not printed.\n\n" >&2

for key in "${REQUIRED_SECRETS[@]}"; do
  read_secret "$key"
done
for key in "${OPTIONAL_SECRETS[@]}"; do
  read_secret "$key" optional
done

printf "\nSyncing Cloudflare Pages secrets for project %s (%s)...\n" "$PROJECT_NAME" "$ENVIRONMENT" >&2
if has_cmd deno; then
  for key in "${!VALUES[@]}"; do
    put_cloudflare_pages_secret "$key" "${VALUES[$key]}"
    printf "Cloudflare Pages: %s saved\n" "$key" >&2
  done
else
  printf "Cloudflare Pages: skipped, deno not installed\n" >&2
fi

printf "\nSyncing Google Secret Manager...\n" >&2
if has_cmd gcloud; then
  for key in "${!VALUES[@]}"; do
    put_gcp_secret "$key" "${VALUES[$key]}"
    printf "Google Secret Manager: %s saved\n" "$key" >&2
  done
else
  printf "Google Secret Manager: skipped, gcloud not installed\n" >&2
fi

printf "\nSyncing 1Password item %s in vault %s...\n" "$OP_ITEM" "$OP_VAULT" >&2
if has_cmd op; then
  ensure_1password_item
  for key in "${!VALUES[@]}"; do
    put_1password_secret "$key" "${VALUES[$key]}"
    printf "1Password: %s saved\n" "$key" >&2
  done
else
  printf "1Password: skipped, op CLI not installed\n" >&2
fi

unset VALUES
printf "\nDone. No secret values were printed.\n" >&2
