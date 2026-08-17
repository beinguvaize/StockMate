-- Applied to prod 17 Aug 2026. Recorded here so the trigger is in the repo.
-- See the function body for why the legacy guard compares amounts rather than
-- which line holds the entry.
--
-- Companion change: the client-side addTxn in src/pages/purchases/index.jsx was
-- removed in the same commit. Re-adding it would double every purchase.

