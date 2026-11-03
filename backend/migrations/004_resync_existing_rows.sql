-- A fresh replication (after every sign-in) pushes all local documents as inserts.
-- For rows that already exist, the insert must fail with a unique violation, which RxDB
-- resolves as a conflict by taking the backend's row. Any other error (a policy or a
-- check on outdated local data) RxDB retries forever, blocking all later pushes. So an
-- existing id is rejected before policies and checks run.

create or replace function public.reject_existing_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    found boolean;
begin
    execute format('select exists (select 1 from %I.%I where id = $1)',
        tg_table_schema, tg_table_name) into found using new.id;
    if found then
        raise exception using
            errcode = 'unique_violation',
            message = format('duplicate key value violates unique constraint "%s_pkey"', tg_table_name);
    end if;
    return new;
end;
$$;

-- Before triggers run in name order, so this one runs first.
drop trigger if exists "0_reject_existing_row" on public.calendar_entries;
create trigger "0_reject_existing_row"
    before insert on public.calendar_entries
    for each row execute function public.reject_existing_row();

drop trigger if exists "0_reject_existing_row" on public.groups;
create trigger "0_reject_existing_row"
    before insert on public.groups
    for each row execute function public.reject_existing_row();

drop trigger if exists "0_reject_existing_row" on public.group_members;
create trigger "0_reject_existing_row"
    before insert on public.group_members
    for each row execute function public.reject_existing_row();

-- From an earlier version of this migration.
drop policy if exists "Existing members are re-pushed" on public.group_members;
drop function if exists public.group_exists(text);
drop function if exists public.group_member_exists(text);
