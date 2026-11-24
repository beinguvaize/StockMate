#!/usr/bin/env bash
#
# Call a Supabase RPC and return its result set, or fail loudly.
#
# Both guard scripts used to pipe the raw response straight into jq. A failed
# call returns an ERROR OBJECT, not an array, and jq went on working on it:
#
#   check-rpc-overloads: `jq length` counted the error's KEYS, so a two-key
#     error was reported as "2 function(s) have duplicate overloads" — a
#     failure that looked like a finding, and stayed red for three months
#     while dev in fact had zero duplicates.
#
#   check-schema-drift: `jq -r '.[].entry'` over two failed calls produces two
#     identical empty files, which diff clean — an unreachable database
#     reported as "schemas match". A false PASS, which is the worse direction.
#
# So: check the status, check the shape, and say what actually came back.

rpc_array() {
  local url="$1" key="$2" fn="$3" payload="${4:-}"
  local resp status body
  [ -n "$payload" ] || payload='{}'

  resp=$(curl -sS -m 30 -w $'\n%{http_code}' -X POST "$url/rest/v1/rpc/$fn" \
    -H "apikey: $key" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d "$payload") || { echo "::error::$fn: request to $url failed" >&2; return 1; }

  status=${resp##*$'\n'}
  body=${resp%$'\n'*}

  if [ "$status" != "200" ]; then
    echo "::error::$fn returned HTTP $status" >&2
    echo "  $body" >&2
    [ "$status" = "401" ] && _explain_401 "$url" "$key" >&2
    return 1
  fi

  if [ "$(printf '%s' "$body" | jq -r 'type' 2>/dev/null)" != "array" ]; then
    echo "::error::$fn did not return a result set — the call failed, it found nothing." >&2
    echo "  $body" >&2
    return 1
  fi

  printf '%s' "$body"
}

# Why a 401 happened, without ever printing the key.
#
# "Invalid API key" is the same message whether the key is stale, truncated, or
# simply belongs to a different project -- and that ambiguity is expensive. The
# schema guard, the nightly audit and the recurring-expense generator all failed
# on this one line for four months, and the message never said which of those it
# was, so there was nothing to act on.
#
# A legacy service_role key is a JWT whose payload carries the project ref it was
# issued for. Comparing that to the ref in SUPABASE_URL answers the common case
# outright: the two halves of the credential are from different projects, which
# is what happens when one is rotated or copied from dev.
_explain_401() {
  local url="$1" key="$2" url_ref key_ref payload

  # https://abcdefgh.supabase.co -> abcdefgh
  url_ref=$(printf '%s' "$url" | sed -E 's#^https?://([^.]+)\..*#\1#')

  case "$key" in
    sb_secret_*|sb_publishable_*)
      echo "  The key is a new-style Supabase key, which carries no project ref to compare."
      echo "  Check it was issued for project '$url_ref' and has not been revoked."
      return 0
      ;;
  esac

  # JWT: header.payload.signature, payload is base64url
  payload=$(printf '%s' "$key" | cut -d. -f2 | tr '_-' '/+')
  # pad to a multiple of 4 so base64 will decode it
  while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload="${payload}="; done
  key_ref=$(printf '%s' "$payload" | base64 -d 2>/dev/null | jq -r '.ref // empty' 2>/dev/null)

  if [ -z "$key_ref" ]; then
    echo "  The key is not a readable Supabase JWT -- likely truncated or not a key at all."
    echo "  SUPABASE_URL points at project '$url_ref'."
    return 0
  fi

  if [ "$key_ref" != "$url_ref" ]; then
    echo "  MISMATCH: SUPABASE_URL is project '$url_ref' but the key was issued for '$key_ref'."
    echo "  One of the two secrets is from the wrong project."
  else
    echo "  The key IS for project '$url_ref', so it has been rotated or revoked."
    echo "  Get the current service_role key from the project's API settings and update the repo secret."
  fi
}
