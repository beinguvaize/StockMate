-- Run against a RESTORED database and diff the output against MANIFEST-*.txt.
-- A restore that "succeeded" but dropped a table looks identical to one that
-- did not, until the day someone needs that table.
select rpad(relname, 34) || ' ' || lpad(n_live_tup::text, 8) as row_counts
  from pg_stat_user_tables where n_live_tup > 0 order by relname;

select 'TOTAL ROWS    ' || sum(n_live_tup) from pg_stat_user_tables
union all select 'FUNCTIONS     ' || count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'TRIGGERS      ' || count(*) from pg_trigger where not tgisinternal
union all select 'RLS POLICIES  ' || count(*) from pg_policies where schemaname = 'public';
