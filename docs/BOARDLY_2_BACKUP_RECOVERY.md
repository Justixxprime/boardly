# Boardly 2.0: Backup and Recovery

Per brief Section 81: "Do not claim 'secure' without operational
recovery." This documents what is actually true right now, not what
would be nice to be true. It was checked against Supabase's own current
documentation while writing this, not assumed from memory.

---

## 1. The one thing you need to check first

Everything below depends on which Supabase plan this project is on, and
that is not something checkable from inside this codebase, only from
your own Supabase billing page. Go to your project's Settings, Billing,
and see whether you are on **Free** or **Pro** (or higher).

**If you are on Free: there is currently no automatic backup of this
database at all.** Supabase does not run scheduled backups on the Free
plan, full stop. If the database were lost or corrupted today, there
would be nothing to restore from unless you had separately exported it
yourself. Given Boardly now moves real money (invoices, Marketplace
escrow payments), this is worth fixing before it matters, not after.

**If you are on Pro:** Supabase automatically keeps a rolling 7 days of
daily backups, no setup needed, visible under Database, Backups in your
dashboard. Point-in-Time Recovery (continuous, second-level recovery
instead of once-a-day snapshots) is available as a paid add-on on top
of Pro, it is not included automatically.

Either way, one thing is true on every plan: **Storage files (uploaded
attachments, images) are never included in any database backup**, only
their metadata is. If Boardly-hosted file attachments matter to you,
they need their own separate backup plan, not covered by anything
below.

## 2. If you are on Free: a real, free way to get backups today

You do not need to upgrade to have *some* real protection. A
`pg_dump` export is a standard Postgres feature, works on every plan,
and gives you a file you actually own, not something that only exists
inside Supabase's own infrastructure.

The practical version of this that costs nothing and runs itself:

1. Get your database connection string from Supabase, Settings,
   Database, Connection string.
2. Set up a scheduled GitHub Actions workflow (since Boardly's own code
   already lives on GitHub) that runs on a weekly or daily cron and
   does two things: runs `pg_dump` against that connection string, and
   uploads the resulting file somewhere you control (a private GitHub
   Actions artifact, or a small object storage bucket you own,
   completely separate from Supabase).
3. This is a real, working safety net, not a placeholder, but it is
   only as good as actually being set up. If you want, tell me and I
   can write that workflow file for you.

## 3. Recovery point and recovery time, stated honestly

The brief asks for these to be defined, so here they are, stated for
what is actually true today rather than an aspirational number:

- **Recovery Point Objective (how much data you could lose):** on
  Free, currently unbounded, everything since the last time anyone
  manually exported anything, which may be never. On Pro with only
  daily backups, up to 24 hours. With PITR added on Pro, seconds.
- **Recovery Time Objective (how long a restore takes):** a Pro-plan
  dashboard restore is Supabase's own managed process, typically
  minutes to low hours depending on database size, not something this
  project controls directly. A `pg_dump` restore you run yourself
  depends entirely on how you do it, expect longer and more manual.

## 4. Migration rollback

Every schema change in this project so far has followed the same rule
already established in `supabase/schema.sql`'s own convention: each
file is additive, none rewrite history in place. That means the
rollback story for a structural change is straightforward and already
documented by the schema files themselves: to undo `schema_vNN`, drop
exactly the column, table, or constraint that file added, nothing else
should need to change. There is no automatic rollback tooling, this is
a manual, deliberate step, on purpose, given Section 89's own rule
against destructive changes happening automatically.

## 5. What this does NOT cover yet

- No tested restore has actually been performed. A backup that has
  never been restored from is unverified, not proven. Worth doing once
  as a real drill, on a duplicate project, not on production.
- No Storage (file attachment) backup plan exists yet, see Section 1
  above.
- No automated alerting exists if a backup silently fails. On Pro,
  Supabase manages this internally, on Free with a custom GitHub
  Actions job, that job's own success or failure needs to be watched
  by hand unless the workflow is set up to notify on failure.
