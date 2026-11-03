-- Settings every user keeps for themselves on a calendar entry, like their notifications.
-- Nobody else sees them. No foreign key to the entry: settings and entries are pushed
-- independently, so the settings may arrive first.

create table if not exists public.calendar_entry_settings (
    id text primary key,
    entry_id text not null,
    user_id uuid not null default auth.uid() references auth.users on delete cascade,
    -- `<minutes before the start>:<message|alarm>`, e.g. `15:message`.
    notifications text[] not null default '{}',
    _modified timestamptz not null default now(),
    _deleted boolean not null default false
);

drop trigger if exists calendar_entry_settings_modified on public.calendar_entry_settings;
create trigger calendar_entry_settings_modified
    before insert or update on public.calendar_entry_settings
    for each row execute function public.set_modified();

drop trigger if exists "0_reject_existing_row" on public.calendar_entry_settings;
create trigger "0_reject_existing_row"
    before insert on public.calendar_entry_settings
    for each row execute function public.reject_existing_row();

alter table public.calendar_entry_settings enable row level security;

drop policy if exists "Users manage their own calendar entry settings" on public.calendar_entry_settings;
create policy "Users manage their own calendar entry settings" on public.calendar_entry_settings
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Live updates for other devices.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_entry_settings'
    ) then
        alter publication supabase_realtime add table public.calendar_entry_settings;
    end if;
end;
$$;
