#!/usr/bin/env bash
#
# check-rpc-overloads.sh
#
# Fails if any public Postgres function has more than one signature.
# A duplicate overload makes PostgREST return PGRST203 "Could not choose
# the best candidate function" for any caller that omits the differing
# parameter — which silently blocked every mobile sale from syncing
# (process_sale 13-arg vs 14-arg) and broke invoice conversion.
#
# Calls the audit_function_overloads() RPC over the Supabase REST API,
# same auth pattern as the nightly outstanding-drift audit.
#
# Usage:
#   SUPABASE_URL=https://<ref>.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt> \
#   scripts/check-rpc-overloads.sh
#
# Exit 0 = clean. Exit 1 = duplicates found (printed).

set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

resp=$(curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/audit_function_overloads" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')

count=$(echo "$resp" | jq 'length')

if [ "$count" -gt 0 ]; then
  echo "::error::$count function(s) have duplicate overloads — these will cause PGRST203 sync failures."
  echo "$resp" | jq -r '.[] | "  • \(.function_name) (\(.overload_count) signatures): \(.signatures)"'
  echo ""
  echo "Fix: alter the function in place (CREATE OR REPLACE + DEFAULT on new param) and DROP the stale signature in the same migration. See CLAUDE.md."
  exit 1
fi

echo "✓ No duplicate RPC overloads."
