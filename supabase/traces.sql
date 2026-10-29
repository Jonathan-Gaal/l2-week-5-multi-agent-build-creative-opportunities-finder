-- Request traces (PRD section 10: one trace entry per request). Applied to project ofjwdioysmzfeiqlfrkl on 2026-10-29.
-- The app (web/server/db/traces.ts, TRACE_SINK=postgres, the default on Vercel) is the only writer: one row per
-- trace line, the whole line in `line` exactly as the JSONL file sink writes it, a few fields copied into columns
-- for lookups. It keeps 30 days (RETENTION_DAYS) by deleting older rows itself. `npm run traces:pull` exports a
-- day back to traces/db-<date>.jsonl. Safe to re-run: every statement is idempotent.

create table if not exists public.traces (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  request_id     text not null,
  search_id      text,              -- shared by the runs of one /api/search
  run_request_id text,              -- cache/shared lines: the run that produced the result
  snapshot_id    text,              -- cache/shared lines
  tier           smallint,
  served_from    text,              -- null for a fresh run, else 'cache' or 'shared'
  line           jsonb not null
);

create index if not exists traces_at on public.traces (at);
create index if not exists traces_request_id on public.traces (request_id);
create index if not exists traces_search_id on public.traces (search_id);

-- Row level security on with NO policies: traces hold visitors' searches, so the public Supabase Data API (the
-- anon/publishable key) must never read or write them. The app connects as the database owner through the pooler
-- (DATABASE_URL), which bypasses RLS, so it needs no policy.
alter table public.traces enable row level security;
revoke all on public.traces from anon, authenticated;
