-- Calendar entries can be shared with groups: every member of an attached group sees them.
-- Only full members may attach a group.

alter table public.calendar_entries
    add column if not exists group_ids text[] not null default '{}';

create index if not exists calendar_entries_group_ids on public.calendar_entries using gin (group_ids);

-- Groups attached by an insert, or added by an update, need a full member.
create or replace function public.check_entry_groups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if exists (
        select 1 from unnest(new.group_ids) gid
        where (tg_op = 'INSERT' or not gid = any(old.group_ids))
            and not public.is_full_member(gid)
    ) then
        raise exception 'Only read-write members can add an entry to a group';
    end if;
    return new;
end;
$$;

drop trigger if exists calendar_entries_check_groups on public.calendar_entries;
create trigger calendar_entries_check_groups
    before insert or update on public.calendar_entries
    for each row execute function public.check_entry_groups();

drop policy if exists "Users manage their own calendar entries" on public.calendar_entries;

drop policy if exists "Users and group members see calendar entries" on public.calendar_entries;
create policy "Users and group members see calendar entries" on public.calendar_entries
    for select to authenticated
    using (user_id = auth.uid()
        or exists (select 1 from unnest(group_ids) gid where public.is_group_member(gid)));

drop policy if exists "Users create their own calendar entries" on public.calendar_entries;
create policy "Users create their own calendar entries" on public.calendar_entries
    for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists "Users update their own calendar entries" on public.calendar_entries;
create policy "Users update their own calendar entries" on public.calendar_entries
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Replication only pulls rows changed after its checkpoint. Rows that just became visible
-- are marked as changed, so the invitee's devices pull them: the group on invitation,
-- the other members and the group's calendar entries on acceptance.
create or replace function public.touch_on_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' and new.status = 'pending' then
        update public.groups set _modified = now() where id = new.group_id;
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
        update public.group_members set _modified = now()
        where group_id = new.group_id and id <> new.id;
        update public.calendar_entries set _modified = now()
        where group_ids @> array[new.group_id];
    end if;
    return null;
end;
$$;
