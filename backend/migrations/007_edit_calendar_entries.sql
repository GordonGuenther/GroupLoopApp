-- Calendar entries are edited (and soft-deleted) by their creator and by full members of any
-- attached group. Editors only add or remove groups they are full members of; the creator
-- may also remove any group.

create or replace function public.check_entry_groups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
        raise exception 'The creator of a calendar entry cannot be changed';
    end if;
    if exists (
        select 1 from unnest(new.group_ids) gid
        where (tg_op = 'INSERT' or not gid = any(old.group_ids))
            and not public.is_full_member(gid)
    ) then
        raise exception 'Only read-write members can add an entry to a group';
    end if;
    if tg_op = 'UPDATE' and old.user_id is distinct from auth.uid() and exists (
        select 1 from unnest(old.group_ids) gid
        where not gid = any(new.group_ids) and not public.is_full_member(gid)
    ) then
        raise exception 'Only read-write members can remove an entry from a group';
    end if;
    return new;
end;
$$;

-- Editors keep at least one of their full groups attached: the app reads every pushed row back,
-- which fails for a row the editor can no longer see. The trigger above guards the rest.
drop policy if exists "Users update their own calendar entries" on public.calendar_entries;
drop policy if exists "Creators and full members update calendar entries" on public.calendar_entries;
create policy "Creators and full members update calendar entries" on public.calendar_entries
    for update to authenticated
    using (user_id = auth.uid()
        or exists (select 1 from unnest(group_ids) gid where public.is_full_member(gid)))
    with check (user_id = auth.uid()
        or exists (select 1 from unnest(group_ids) gid where public.is_full_member(gid)));
