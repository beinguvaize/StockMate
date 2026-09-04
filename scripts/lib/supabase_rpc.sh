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
  local url="$1" key="$2" fn="$3"
  local resp status body

  resp=$(curl -sS -m 30 -w $'\n%{http_code}' -X POST "$url/rest/v1/rpc/$fn" \
    -H "apikey: $key" \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    -d '{}') || { echo "::error::$fn: request to $url failed" >&2; return 1; }

  status=${resp##*$'\n'}
  body=${resp%$'\n'*}

  if [ "$status" != "200" ]; then
    echo "::error::$fn returned HTTP $status" >&2
    echo "  $body" >&2
    return 1
  fi

  if [ "$(printf '%s' "$body" | jq -r 'type' 2>/dev/null)" != "array" ]; then
    echo "::error::$fn did not return a result set — the call failed, it found nothing." >&2
    echo "  $body" >&2
    return 1
  fi

  printf '%s' "$body"
}
