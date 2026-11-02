-- Extra kinds of a listing (records.json `also_subtypes`, e.g. a casting call that is also a paid gig). The app's kind
-- filter (web/server/agents/filter.ts fitsSubtypes) matches a picked kind against subtype OR also_subtypes, so without
-- this column a Postgres-served search drops listings the JSON snapshot keeps. Additive and safe to re-run.
-- Apply BEFORE deploying the web code that selects it, and before loading a snapshot with scripts/load_supabase.py.

alter table public.opportunities add column if not exists also_subtypes text[] not null default '{}';
