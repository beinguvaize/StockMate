-- Fix: "function public.adjust_inventory_atomic(...) is not unique".
-- Two overloads existed (6-arg legacy + 9-arg superset). A 6-arg call
-- matched both → ambiguity → every stock operation failed.
-- Drop the legacy 6-arg version; keep the 9-arg one (same core logic
-- plus movement-log support and parameter defaults).
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-22.

DROP FUNCTION IF EXISTS public.adjust_inventory_atomic(text, uuid, numeric, text, text, uuid);
