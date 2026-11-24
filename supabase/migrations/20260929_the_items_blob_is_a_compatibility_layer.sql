-- Phase 5b closes here, at step 2b. No behaviour change: this migration only
-- records, in the database itself, what these columns now are -- so that the
-- next person to read them does not mistake a legacy copy for live data.
--
-- WHY STEP 3 IS NOT BEING DONE
--
-- Step 3 was "stop writing the blob". It would break every installed mobile
-- app, irreversibly for anyone who does not update.
--
-- The Flutter app has NO knowledge that sale_items exists -- grep finds not one
-- reference. Its Drift schema stores sales.items as a NOT NULL column
-- (database.dart, `TextColumn get itemsJson => text()()`), filled from
-- sales.items by sync_service, and sale detail, invoice detail and the daybook
-- all render from it. Stop writing the blob and every new sale syncs down as
-- itemsJson = '[]': blank line items on bills. A new APK fixes future installs,
-- but installed versions keep running, so anyone who does not update gets blank
-- bills permanently.
--
-- WHAT THE PHASE WAS ACTUALLY FOR, AND WHY IT IS DONE
--
-- The goal was that the line TABLES, not the JSON, are the source of truth for
-- money. That is achieved:
--
--   * Phase 5a moved every server-side reader -- gl_post_sales,
--     gl_post_sales_returns, get_pl_ranged, void_sale, unvoid_sale,
--     reverse_sales_return.
--   * Phase 5b.2 and 5b.2b made process_sale, edit_sale and
--     process_sales_return write the tables DIRECTLY, and dropped both
--     derive-from-blob triggers.
--
-- Nothing computes money from these blobs any more. Dropping the write would
-- buy storage, not correctness, at the cost of a field-breaking change.
--
-- AND IT KEEPS THE SAFETY NET
--
-- audit_sale_items works by comparing the blob against the table. Keeping the
-- blob written is what lets that check keep running every night as an
-- INDEPENDENT verification of the direct writes -- which is what makes 5b.2
-- and 5b.2b self-verifying rather than merely tested once.

COMMENT ON COLUMN public.sales.items IS
  'LEGACY COMPATIBILITY COPY -- NOT the source of truth. The sale lines live in '
  'public.sale_items; every server-side money path reads that table. This JSON '
  'is still written by process_sale and edit_sale solely so that installed '
  'mobile clients, which have no knowledge of sale_items, keep rendering line '
  'items. It is also what audit_sale_items compares the table against. Do not '
  'add new readers, and do not compute money from it.';

COMMENT ON COLUMN public.sales_returns.items IS
  'LEGACY COMPATIBILITY COPY -- NOT the source of truth. The return lines live '
  'in public.sales_return_items; gl_post_sales_returns and get_pl_ranged read '
  'that table. This JSON is still written by process_sales_return for legacy '
  'mobile clients. Do not add new readers, and do not compute money from it.';

COMMENT ON TABLE public.sale_items IS
  'Source of truth for sale lines. Written directly by process_sale and '
  'edit_sale via write_sale_lines(). sales.items is a legacy copy kept for '
  'mobile clients.';

COMMENT ON TABLE public.sales_return_items IS
  'Source of truth for sales return lines, including the cost_price recorded at '
  'the time of return. Written directly by process_sales_return via '
  'write_sales_return_lines(). sales_returns.items is a legacy copy kept for '
  'mobile clients.';
