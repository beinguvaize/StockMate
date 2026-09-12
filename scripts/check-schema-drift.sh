#!/usr/bin/env bash
#
# check-schema-drift.sh
#
# Fails if the dev and prod public schemas differ (columns or function
# signatures). Catches the class of bug where a migration was applied to
# one environment but not the other — e.g. the `deleted_at` column that
# was present on prod but missing on dev and broke checkout.
#
# Calls schema_signature() on both projects over the REST API and diffs
# the returned line lists.
#
# Usage:
#   DEV_SUPABASE_URL=https://<dev>.supabase.co \
#   DEV_SERVICE_ROLE_KEY=<dev_jwt> \
#   PROD_SUPABASE_URL=https://<prod>.supabase.co \
#   PROD_SERVICE_ROLE_KEY=<prod_jwt> \
#   scripts/check-schema-drift.sh
#
# Exit 0 = identical. Exit 1 = drift (unified diff printed).

set -euo pipefail

: "${DEV_SUPABASE_URL:?}";  : "${DEV_SERVICE_ROLE_KEY:?}"
: "${PROD_SUPABASE_URL:?}"; : "${PROD_SERVICE_ROLE_KEY:?}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/supabase_rpc.sh
. "$SCRIPT_DIR/lib/supabase_rpc.sh"

fetch() {
  local url="$1" key="$2"
  rpc_array "$url" "$key" schema_signature | jq -r '.[].entry' | sort
}

dev=$(mktemp);  prod=$(mktemp)
trap 'rm -f "$dev" "$prod"' EXIT

fetch "$DEV_SUPABASE_URL"  "$DEV_SERVICE_ROLE_KEY"  > "$dev"  || exit 2
fetch "$PROD_SUPABASE_URL" "$PROD_SERVICE_ROLE_KEY" > "$prod" || exit 2

# An empty signature is never legitimate, and two empty ones diff clean — the
# shape of the false pass this guard is meant to prevent.
for f in "$dev" "$prod"; do
  if [ ! -s "$f" ]; then
    echo "::error::schema_signature returned no entries — refusing to call that a match."
    exit 2
  fi
done

if diff -q "$dev" "$prod" >/dev/null; then
  echo "✓ Dev and prod schemas match ($(wc -l < "$dev" | tr -d ' ') entries)."
  exit 0
fi

echo "::error::Dev and prod schemas have drifted. < dev   > prod"
diff "$dev" "$prod" || true
exit 1
