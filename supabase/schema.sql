-- Opportunity snapshot store (PRD section 4a). Applied to project ofjwdioysmzfeiqlfrkl on 2026-10-28.
-- The backfill loader (scripts/load_supabase.py, secret key) is the only writer. The app reads with the
-- publishable key and sees published snapshots only; staging rows are invisible to it.

create table public.snapshots (
  id            text primary key,                      -- e.g. '2026-10-27'
  status        text not null check (status in ('staging', 'published', 'retired')),
  snapshot_date date not null,
  record_count  integer not null default 0,
  published_at  timestamptz,
  manifest      jsonb
);

-- At most one published snapshot: readers always see exactly one, or none.
create unique index snapshots_one_published on public.snapshots (status) where status = 'published';

create table public.opportunities (
  snapshot_id      text not null references public.snapshots (id) on delete cascade,
  dedupe_key       text not null,
  title            text not null,
  org              text,
  opportunity_type text not null check (opportunity_type in ('event', 'open_call', 'grant', 'residency', 'job', 'unknown')),
  subtype          text,
  borough          text check (borough in ('manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island', 'citywide', 'unknown')),
  region           text not null,
  deadline         text,          -- ISO date, 'rolling', 'recurring', or null (not listed)
  last_date        date,          -- expiry: last event date, else the deadline date; null never expires
  recurrence       text,
  event_dates      date[],
  opens_at         text,
  fee              text,
  award            text,
  location         text,
  eligibility      jsonb not null default '[]',
  disciplines      text[] not null default '{}',
  source           text not null,
  source_url       text not null,
  event_website    text,
  extraction       text,
  caveat           text,
  checked_at       date not null,
  fetched_at       date,
  primary key (snapshot_id, dedupe_key)
);

create index opportunities_borough_filter on public.opportunities (snapshot_id, opportunity_type, borough);
create index opportunities_region_filter  on public.opportunities (snapshot_id, opportunity_type, region);

alter table public.snapshots enable row level security;
alter table public.opportunities enable row level security;

create policy "Published snapshots are public" on public.snapshots
  for select to anon, authenticated
  using (status = 'published');

create policy "Opportunities in the published snapshot are public" on public.opportunities
  for select to anon, authenticated
  using (exists (select 1 from public.snapshots s where s.id = snapshot_id and s.status = 'published'));

-- Read-only Data API access; no insert, update or delete for public roles.
revoke all on public.snapshots, public.opportunities from anon, authenticated;
grant select on public.snapshots, public.opportunities to anon, authenticated;

-- Staged publish in one transaction: retire the current snapshot and publish the staged one, so readers
-- never see zero or two published snapshots. Callable with the secret key only.
create function public.publish_snapshot(target text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.snapshots where id = target and status = 'staging') then
    raise exception 'snapshot % is not in staging', target;
  end if;
  update public.snapshots set status = 'retired' where status = 'published';
  update public.snapshots set status = 'published', published_at = now() where id = target;
end;
$$;

revoke execute on function public.publish_snapshot(text) from public, anon, authenticated;
grant execute on function public.publish_snapshot(text) to service_role;
