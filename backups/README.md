# Taking a backup

There is no automated backup. The nightly job has never succeeded, and the
Supabase plan includes no automatic backups, so this is currently the only copy
procedure that exists.

## Take one

Connection string: Supabase dashboard -> Project Settings -> Database ->
Connection string -> URI. It contains the database password, so it never goes
in this repo, in a commit, or in a chat.

```bash
pg_dump "postgresql://postgres:<password>@db.lmviftlynuhopzmvaxeu.supabase.co:5432/postgres" \
  --no-owner --no-privileges \
  | gzip > stockmate-$(date +%F).sql.gz
```

`--no-owner --no-privileges` keeps the dump restorable into a database that
does not have Supabase's exact role names — which is what you will have in an
emergency.

## Check it is real before trusting it

```bash
gzip -t stockmate-*.sql.gz                          # not truncated
gunzip -c stockmate-*.sql.gz | grep -c "^COPY "     # tables with data
ls -lh stockmate-*.sql.gz                           # expect single-digit MB
```

A dump that ends mid-statement still gzips fine and still looks like a backup.

## Verify a restore

Restore into a scratch database, run `verify.sql`, and diff against the
manifest for that date. A restore that skipped a table succeeds silently.

## Where to keep it

Not only on the machine that made it. Two copies, one off the premises.

## Stop doing this by hand

Either set the five repo secrets the nightly job needs (`SUPABASE_DB_URL`,
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) —
the workflow is already written and correct — or move to Supabase Pro, which
includes daily backups and also lifts the Disk IO ceiling this project has
already been warned about. Ideally both: one of them survives losing access to
the Supabase account itself.
