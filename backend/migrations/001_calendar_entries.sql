-- Calendar entries, synced by RxDB's Supabase replication.
-- Every user only sees their own entries, on all of their devices.

create table if not exists public.calendar_entries (
    id text primary key,
    user_id uuid not null default auth.uid() references auth.users on delete cascade,
    title text not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    -- RxDB pulls changes ordered by _modified and soft-deletes via _deleted.
    _modified timestamptz not null default now(),
    _deleted boolean not null default false
);

create or replace function public.set_modified() returns trigger
language plpgsql as $$
begin
    new._modified := now();
    return new;
end;
$$;

drop trigger if exists calendar_entries_modified on public.calendar_entries;
create trigger calendar_entries_modified
    before insert or update on public.calendar_entries
    for each row execute function public.set_modified();

alter table public.calendar_entries enable row level security;

drop policy if exists "Users manage their own calendar entries" on public.calendar_entries;
create policy "Users manage their own calendar entries" on public.calendar_entries
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Live updates for other devices.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_entries'
    ) then
        alter publication supabase_realtime add table public.calendar_entries;
    end if;
end;
$$;
