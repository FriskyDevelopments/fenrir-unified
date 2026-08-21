#!/usr/bin/env bash
set -euo pipefail

HOSTS=("https://myfenrir.com" "https://www.myfenrir.com")
FAIL=0

for base in "${HOSTS[@]}"; do
  code="$(curl -sS -L -o /dev/null -w "%{http_code}" --max-time 20 "${base}/healthz" || echo "000")"
  if [[ "$code" != "200" ]]; then
    echo "FAIL ${base}/healthz HTTP ${code} (expected 200; 522 = origin timeout)"
    FAIL=1
  else
    body="$(curl -sS -L --max-time 20 "${base}/healthz")"
    if [[ "$body" != "ok" ]]; then
      printf "FAIL %s/healthz body=%q (expected ok; SPA fallback = deploy /healthz function)\n" "$base" "$body"
      FAIL=1
    else
      echo "OK   ${base}/healthz"
    fi
  fi

  callback_response="$(curl -sS -L --max-time 20 -w $'\n%{http_code}' "${base}/auth/callback" || printf '\n000')"
  callback_code="$(printf "%s" "$callback_response" | tail -n 1)"
  callback_body="$(printf "%s" "$callback_response" | sed '$d')"
  if [[ "$callback_code" != "200" || "$callback_body" != *"<!doctype html>"* ]]; then
    echo "FAIL ${base}/auth/callback HTTP ${callback_code}; expected SPA HTML callback route"
    FAIL=1
  else
    echo "OK   ${base}/auth/callback"
  fi

  auth_body="$(curl -sS -L --max-time 20 "${base}/api/auth/me" || true)"
  if [[ "$auth_body" != *'"ok":true'* || "$auth_body" != *'"authenticated":false'* ]]; then
    echo "FAIL ${base}/api/auth/me did not return unauthenticated JSON (SPA fallback or API routing broken)"
    FAIL=1
  else
    echo "OK   ${base}/api/auth/me"
  fi

  session_response="$(curl -sS -L --max-time 20 -w $'\n%{http_code}' -X POST "${base}/api/auth/supabase-session" -H "Content-Type: application/json" --data '{}' || printf '\n000')"
  session_code="$(printf "%s" "$session_response" | tail -n 1)"
  session_body="$(printf "%s" "$session_response" | sed '$d')"
  if [[ "$session_code" != "400" || "$session_body" != *'"missing_supabase_access_token"'* ]]; then
    echo "FAIL ${base}/api/auth/supabase-session HTTP ${session_code}; expected 400 missing_supabase_access_token"
    FAIL=1
  else
    echo "OK   ${base}/api/auth/supabase-session"
  fi

  direct_oauth_response="$(curl -sS -i --max-time 20 "${base}/api/auth/callback/apple" || printf '\nHTTP/1.1 000')"
  if [[ "$direct_oauth_response" != *"HTTP/1.1 302"* && "$direct_oauth_response" != *"HTTP/2 302"* ]] || [[ "$direct_oauth_response" != *"auth_error=missing_code"* ]]; then
    if [[ "$direct_oauth_response" == *" 410 "* && "$direct_oauth_response" == *'"error":"direct_oauth_disabled"'* ]]; then
      echo "OK   ${base}/api/auth/callback/apple intentionally retired; Supabase is the OAuth broker"
    else
      echo "FAIL ${base}/api/auth/callback/apple expected retired direct-OAuth 410 JSON or an enabled-provider 302"
      FAIL=1
    fi
  else
    echo "OK   ${base}/api/auth/callback/apple direct provider enabled"
  fi

  readiness_response="$(curl -sS -L --max-time 20 -w $'\n%{http_code}' "${base}/api/readiness" || printf '\n000')"
  readiness_code="$(printf "%s" "$readiness_response" | tail -n 1)"
  readiness_body="$(printf "%s" "$readiness_response" | sed '$d')"
  if [[ "$readiness_code" != "401" || "$readiness_body" != *'"authentication_required"'* ]]; then
    echo "FAIL ${base}/api/readiness HTTP ${readiness_code}; expected 401 authentication_required without session"
    FAIL=1
  else
    echo "OK   ${base}/api/readiness"
  fi
done

exit "$FAIL"
