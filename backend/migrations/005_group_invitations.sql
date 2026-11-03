-- Group invitations: pending group_members rows, matched to the invitee by email.
-- The invitee accepts (pending -> active) or declines (soft delete), full members revoke.
-- Invitees the backend does not know yet get an email via GoTrue's invite.

alter table public.group_members
    add column if not exists status text not null default 'active',
    add column if not exists invited_by_email text;

-- Pending rows get their user when the invitee accepts.
alter table public.group_members alter column user_id drop not null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'group_members_status_check') then
        alter table public.group_members add constraint group_members_status_check
            check (status in ('active', 'pending') and (status = 'pending' or user_id is not null));
    end if;
end;
$$;

create unique index if not exists group_members_active_user on public.group_members (group_id, user_id)
    where status = 'active' and not _deleted;
create unique index if not exists group_members_pending_email on public.group_members (group_id, lower(email))
    where status = 'pending' and not _deleted;

create or replace function public.my_email() returns text
language sql stable as $$
    select lower(auth.jwt() ->> 'email');
$$;

create or replace function public.is_group_member(gid text) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid() and status = 'active' and not _deleted
    );
$$;

create or replace function public.is_full_member(gid text) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid() and role = 'full' and status = 'active'
            and not _deleted
    );
$$;

create or replace function public.is_invited(gid text) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and lower(email) = public.my_email() and status = 'pending'
            and not _deleted
    );
$$;

create or replace function public.prepare_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.status = 'pending' then
        new.email := lower(new.email);
        new.invited_by_email := (select email from auth.users where id = auth.uid());
    end if;
    return new;
end;
$$;

drop trigger if exists group_members_prepare_invitation on public.group_members;
create trigger group_members_prepare_invitation
    before insert on public.group_members
    for each row execute function public.prepare_invitation();

-- Removing (a soft delete) and accepting are the only changes allowed.
create or replace function public.guard_group_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if old.status = 'pending' and new.status = 'active' then
        if old._deleted or new._deleted or old.email is distinct from public.my_email()
            or new.user_id is distinct from auth.uid()
            or (new.id, new.group_id, new.role, new.email, new.invited_by_email)
                is distinct from (old.id, old.group_id, old.role, old.email, old.invited_by_email) then
            raise exception 'Only the invitee can accept an invitation';
        end if;
        return new;
    end if;
    if (new.id, new.group_id, new.user_id, new.role, new.email, new.status, new.invited_by_email)
        is distinct from
        (old.id, old.group_id, old.user_id, old.role, old.email, old.status, old.invited_by_email) then
        raise exception 'Only removing a group member or accepting an invitation is allowed';
    end if;
    if old._deleted and not new._deleted then
        raise exception 'A removed group member cannot be restored';
    end if;
    if new._deleted and not old._deleted and old.status = 'active' and old.role = 'full' and not exists (
        select 1 from public.group_members
        where group_id = old.group_id and id <> old.id and role = 'full' and status = 'active'
            and not _deleted
    ) then
        raise exception 'A group needs at least one read-write member';
    end if;
    return new;
end;
$$;

-- Replication only pulls rows changed after its checkpoint. Rows that just became visible
-- are marked as changed, so the invitee's devices pull them: the group on invitation,
-- the other members on acceptance.
create or replace function public.touch_on_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' and new.status = 'pending' then
        update public.groups set _modified = now() where id = new.group_id;
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
        update public.group_members set _modified = now()
        where group_id = new.group_id and id <> new.id;
    end if;
    return null;
end;
$$;

drop trigger if exists group_members_touch_on_invitation on public.group_members;
create trigger group_members_touch_on_invitation
    after insert or update on public.group_members
    for each row execute function public.touch_on_invitation();

-- Backend settings for invitation emails, stored by migrate.sh from supabase/.env.
create or replace function public.set_backend_secret(secret_name text, secret text) returns void
language plpgsql security definer set search_path = public as $$
declare
    secret_id uuid;
begin
    select id into secret_id from vault.secrets where name = secret_name;
    if secret_id is null then
        perform vault.create_secret(secret, secret_name);
    else
        perform vault.update_secret(secret_id, secret);
    end if;
end;
$$;

revoke execute on function public.set_backend_secret(text, text) from public, anon, authenticated;

create or replace function public.backend_secret(secret_name text) returns text
language sql stable security definer set search_path = public as $$
    select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$$;

revoke execute on function public.backend_secret(text) from public, anon, authenticated;

-- Known users get the invitation via sync only.
create or replace function public.send_invitation_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    service_key text := public.backend_secret('grouploop_service_role_key');
begin
    if new.status <> 'pending'
        or exists (select 1 from auth.users where lower(email) = new.email) then
        return null;
    end if;
    if service_key is null then
        raise warning 'Invitation email not sent: run migrate.sh to store the backend settings';
        return null;
    end if;
    perform net.http_post(
        url := 'http://auth:9999/invite',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
            'email', new.email,
            'data', jsonb_build_object(
                'group_name', (select name from public.groups where id = new.group_id),
                'invited_by', new.invited_by_email,
                'backend_url', public.backend_secret('grouploop_api_url'),
                'api_key', public.backend_secret('grouploop_anon_key'),
                'web_url', coalesce(public.backend_secret('grouploop_site_url'), '')
            )
        )
    );
    return null;
end;
$$;

drop trigger if exists group_members_send_invitation_email on public.group_members;
create trigger group_members_send_invitation_email
    after insert on public.group_members
    for each row execute function public.send_invitation_email();

-- Invitees see their invitations (revoked ones too, so their devices learn about it).
drop policy if exists "Members see the members of their groups" on public.group_members;
create policy "Members see the members of their groups" on public.group_members
    for select to authenticated
    using (user_id = auth.uid() or lower(email) = public.my_email()
        or public.is_group_member(group_id));

drop policy if exists "Full members invite" on public.group_members;
create policy "Full members invite" on public.group_members
    for insert to authenticated
    with check (status = 'pending' and user_id is null and not _deleted
        and public.is_full_member(group_id));

drop policy if exists "Members leave, full members remove" on public.group_members;
drop policy if exists "Members leave, full members remove, invitees answer" on public.group_members;
create policy "Members leave, full members remove, invitees answer" on public.group_members
    for update to authenticated
    using (user_id = auth.uid() or public.is_full_member(group_id)
        or (status = 'pending' and lower(email) = public.my_email()))
    with check (user_id = auth.uid() or public.is_full_member(group_id)
        or lower(email) = public.my_email());

drop policy if exists "Members see their groups" on public.groups;
create policy "Members see their groups" on public.groups
    for select to authenticated
    using (public.is_group_member(id) or public.is_invited(id));
