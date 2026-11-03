-- Group members, synced by RxDB's Supabase replication.
-- Members see everyone in their groups. Full members remove anyone, everyone may leave.

alter table public.group_members
    -- RxDB needs a single primary key: `<group_id>:<user_id>`.
    add column if not exists id text,
    -- Copied from auth.users, which the app cannot read.
    add column if not exists email text,
    add column if not exists _modified timestamptz not null default now(),
    add column if not exists _deleted boolean not null default false;

update public.group_members set id = group_id || ':' || user_id where id is null;
update public.group_members m set email = u.email
    from auth.users u where u.id = m.user_id and m.email is null;

alter table public.group_members alter column id set not null;
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.group_members'::regclass and contype = 'p'
            and conkey = array[(
                select attnum from pg_attribute
                where attrelid = 'public.group_members'::regclass and attname = 'id'
            )]
    ) then
        alter table public.group_members drop constraint if exists group_members_pkey;
        alter table public.group_members add primary key (id);
    end if;
end;
$$;
-- Replaced by the primary key.
drop index if exists public.group_members_id;

drop trigger if exists group_members_modified on public.group_members;
create trigger group_members_modified
    before insert or update on public.group_members
    for each row execute function public.set_modified();

create or replace function public.add_group_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.group_members (id, group_id, user_id, email, role)
    select new.id || ':' || new.created_by, new.id, new.created_by, u.email, 'full'
    from auth.users u where u.id = new.created_by;
    return new;
end;
$$;

-- Security definer, so policies on group_members can use them without recursing.
create or replace function public.is_group_member(gid text) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid() and not _deleted
    );
$$;

create or replace function public.is_full_member(gid text) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid() and role = 'full' and not _deleted
    );
$$;

-- Removing (a soft delete) is the only change allowed, and never of the last full member.
-- When the last member leaves, the app deletes the group instead.
create or replace function public.guard_group_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if (new.id, new.group_id, new.user_id, new.role, new.email)
        is distinct from (old.id, old.group_id, old.user_id, old.role, old.email) then
        raise exception 'Only removing a group member is allowed';
    end if;
    if old._deleted and not new._deleted then
        raise exception 'A removed group member cannot be restored';
    end if;
    if new._deleted and not old._deleted and old.role = 'full' and not exists (
        select 1 from public.group_members
        where group_id = old.group_id and user_id <> old.user_id and role = 'full' and not _deleted
    ) then
        raise exception 'A group needs at least one read-write member';
    end if;
    return new;
end;
$$;

drop trigger if exists group_members_guard on public.group_members;
create trigger group_members_guard
    before update on public.group_members
    for each row execute function public.guard_group_member_update();

-- Own rows stay visible after removal, so the removed user's devices learn about it.
drop policy if exists "Users see their own memberships" on public.group_members;
drop policy if exists "Members see the members of their groups" on public.group_members;
create policy "Members see the members of their groups" on public.group_members
    for select to authenticated
    using (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists "Members leave, full members remove" on public.group_members;
create policy "Members leave, full members remove" on public.group_members
    for update to authenticated
    using (user_id = auth.uid() or public.is_full_member(group_id))
    with check (user_id = auth.uid() or public.is_full_member(group_id));

drop policy if exists "Members see their groups" on public.groups;
create policy "Members see their groups" on public.groups
    for select to authenticated
    using (public.is_group_member(id));

drop policy if exists "Full members update their groups" on public.groups;
create policy "Full members update their groups" on public.groups
    for update to authenticated
    using (public.is_full_member(id));

-- Live updates for other devices.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
    ) then
        alter publication supabase_realtime add table public.group_members;
    end if;
end;
$$;
