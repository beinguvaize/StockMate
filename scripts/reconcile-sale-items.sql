-- Does sale_items still agree with sales.items?
--
-- Run while BOTH representations exist. Every count must be zero. This is the
-- check that makes it safe to move readers across in a later phase, and the one
-- that must stay clean through live traffic before the blob stops being written.

with blob as (
  select s.id, jsonb_array_length(s.items) as n,
         sum((e.it->>'quantity')::numeric) as qty,
         sum((e.it->>'quantity')::numeric * (e.it->>'rate')::numeric) as value
    from public.sales s, lateral jsonb_array_elements(s.items) as e(it)
   where jsonb_typeof(s.items) = 'array'
   group by s.id, s.items
), tbl as (
  select sale_id as id, count(*) as n, sum(quantity) as qty, sum(line_total) as value
    from public.sale_items group by sale_id
)
select
  count(*) filter (where b.n     is distinct from t.n)     as line_count_mismatch,
  count(*) filter (where b.qty   is distinct from t.qty)   as quantity_mismatch,
  count(*) filter (where b.value is distinct from t.value) as value_mismatch,
  count(*) filter (where t.id is null)                     as sales_missing_from_table,
  count(*) filter (where b.id is null)                     as rows_with_no_blob
from blob b full outer join tbl t using (id);
