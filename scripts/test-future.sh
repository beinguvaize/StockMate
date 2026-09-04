#!/usr/bin/env bash
# Run the unit suite as if it were several future dates.
#
# WHY. On 27 Aug 2026 four tenancy tests became false because the calendar
# moved — no commit, no warning. `npm run build` runs the suite through npm's
# prebuild hook, so the build began exiting 1, vite never ran, and Cloudflare
# kept serving the last good bundle. The site looked fine while five days of
# fixes went nowhere. Running the old tests under this script at 2026-09-01
# reproduces those four failures, so it would have caught it days early.
#
# The dates are chosen to hit the shapes that break date logic: month ends,
# the 31st, a year boundary, both sides of a non-leap February, a leap day,
# and a point far enough out that anything anchored to "roughly now" fails.
set -uo pipefail

DATES=(
  "2026-09-30"  # month end
  "2026-10-31"  # 31st
  "2026-12-31"  # year end
  "2027-01-01"  # year start
  "2027-02-28"  # non-leap Feb end
  "2027-03-01"  # day after
  "2027-09-01"  # a year out
  "2028-02-29"  # leap day
  "2029-06-15"  # far future
)

fail=0
for d in "${DATES[@]}"; do
  out=$(WARP_TO="${d}T10:00:00+05:30" npx vitest run --config vitest.future.config.js 2>&1)
  line=$(printf '%s\n' "$out" | grep -E "^ *Tests " | tail -1 | sed 's/^ *//')
  if printf '%s\n' "$out" | grep -qE "^ *Tests .*failed"; then
    echo "FAIL  as if $d — $line"
    printf '%s\n' "$out" | grep -E "^ *FAIL |× " | head -10
    fail=1
  else
    echo "ok    as if $d — $line"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "A test above holds today but not on the date shown. Left alone it will"
  echo "turn the deploy red on that date, with no commit to explain it. Pin the"
  echo "clock in the test (see the enforcement block in src/lib/tenancy.test.js)"
  echo "rather than widening the assertion."
fi
exit "$fail"
