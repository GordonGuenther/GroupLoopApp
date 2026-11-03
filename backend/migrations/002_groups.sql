-- Groups, synced by RxDB's Supabase replication.
-- Every user sees the groups they are a member of, on all of their devices.

create table if not exists public.groups (
    id text primary key,
    created_by uuid not null default auth.uid() references auth.users on delete cascade,
    name text not null,
    color text not null default '#ff7700',
    -- `default:<n>` for one of the app's built-in images.
    image text not null,
    -- RxDB pulls changes ordered by _modified and soft-deletes via _deleted.
    _modified timestamptz not null default now(),
    _deleted boolean not null default false
);

drop trigger if exists groups_modified on public.groups;
create trigger groups_modified
    before insert or update on public.groups
    for each row execute function public.set_modified();

-- Full members may change the group (and later its members), read members only see it.
create table if not exists public.group_members (
    group_id text not null references public.groups on delete cascade,
    user_id uuid not null references auth.users on delete cascade,
    role text not null check (role in ('full', 'read')),
    primary key (group_id, user_id)
);

-- The creator becomes the first full member.
create or replace function public.add_group_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.group_members (group_id, user_id, role)
    values (new.id, new.created_by, 'full');
    return new;
end;
$$;

drop trigger if exists groups_add_creator on public.groups;
create trigger groups_add_creator
    after insert on public.groups
    for each row execute function public.add_group_creator();

alter table public.group_members enable row level security;

drop policy if exists "Users see their own memberships" on public.group_members;
create policy "Users see their own memberships" on public.group_members
    for select to authenticated
    using (user_id = auth.uid());

alter table public.groups enable row level security;

drop policy if exists "Members see their groups" on public.groups;
create policy "Members see their groups" on public.groups
    for select to authenticated
    using (exists (
        select 1 from public.group_members
        where group_id = groups.id and user_id = auth.uid()
    ));

drop policy if exists "Users create groups" on public.groups;
create policy "Users create groups" on public.groups
    for insert to authenticated
    with check (created_by = auth.uid());

drop policy if exists "Full members update their groups" on public.groups;
create policy "Full members update their groups" on public.groups
    for update to authenticated
    using (exists (
        select 1 from public.group_members
        where group_id = groups.id and user_id = auth.uid() and role = 'full'
    ));

-- Live updates for other devices.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
    ) then
        alter publication supabase_realtime add table public.groups;
    end if;
end;
$$;
