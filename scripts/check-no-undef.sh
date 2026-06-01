#!/usr/bin/env bash
#
# check-no-undef.sh
#
# Fails if ESLint reports any `no-undef` error. These are the
# undefined-reference bugs (e.g. a helper used out of scope, or a
# missing import) that vite build does NOT catch — they only surface as
# a runtime white-screen in the browser. We gate on this single rule so
# the check stays green against the repo's existing unrelated lint noise.
#
# Usage: scripts/check-no-undef.sh   (run from repo root)

set -uo pipefail

json="$(npx eslint . -f json 2>/dev/null)"

count="$(echo "$json" | jq '[.[].messages[] | select(.ruleId == "no-undef" and .severity == 2)] | length')"

if [ "${count:-0}" -gt 0 ]; then
  echo "::error::$count no-undef error(s) — undefined references that white-screen at runtime:"
  echo "$json" | jq -r '.[] as $f | $f.messages[] | select(.ruleId == "no-undef" and .severity == 2) | "  \($f.filePath):\(.line):\(.column)  \(.message)"'
  exit 1
fi

echo "✓ No no-undef errors."
