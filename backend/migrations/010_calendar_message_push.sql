-- Push tokens and delivery state are deliberately separate from replicated calendar data.
create extension if not exists pg_cron;

create table if not exists public.calendar_message_push_devices (
    device_id text primary key,
    user_id uuid not null references auth.users on delete cascade,
    expo_push_token text not null unique,
    last_seen_at timestamptz not null default now()
);

alter table public.calendar_message_push_devices enable row level security;
revoke all on public.calendar_message_push_devices from public, anon, authenticated;

create table if not exists public.calendar_message_push_deliveries (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users on delete cascade,
    entry_id text not null,
    device_id text not null,
    starts_at timestamptz not null,
    reminder_minutes integer not null check (reminder_minutes >= 0),
    due_at timestamptz not null,
    status text not null default 'pending'
        check (status in (
            'pending', 'sending', 'receipt_pending', 'receipt_sending',
            'retry', 'sent', 'cancelled', 'failed'
        )),
    attempts integer not null default 0,
    receipt_attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    request_id bigint,
    receipt_id text,
    receipt_request_id bigint,
    sent_token text,
    last_error text,
    updated_at timestamptz not null default now(),
    unique (user_id, entry_id, starts_at, reminder_minutes, device_id)
);

alter table public.calendar_message_push_deliveries enable row level security;
revoke all on public.calendar_message_push_deliveries from public, anon, authenticated;

create index if not exists calendar_message_push_due
    on public.calendar_message_push_deliveries (due_at, next_attempt_at)
    where status in ('pending', 'retry');
create index if not exists calendar_message_push_response
    on public.calendar_message_push_deliveries (request_id)
    where status = 'sending' and request_id is not null;
create index if not exists calendar_message_push_receipt_response
    on public.calendar_message_push_deliveries (receipt_request_id)
    where status = 'receipt_sending' and receipt_request_id is not null;
create index if not exists calendar_message_push_receipt_due
    on public.calendar_message_push_deliveries (next_attempt_at, id)
    where status = 'receipt_pending';

create or replace function public.register_calendar_message_push_device(
    p_device_id text,
    p_expo_push_token text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Sign in before registering push notifications';
    end if;
    if public.backend_secret('grouploop_android_fcm_v1_configured') is distinct from 'true' then
        raise exception using
            errcode = 'P0001',
            message = 'ANDROID_PUSH_NOT_CONFIGURED: configure Android FCM v1 credentials before registering devices';
    end if;
    if coalesce(p_device_id !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$', true)
        or coalesce(p_expo_push_token !~ '^(Expo|Exponent)PushToken\[[^]]+\]$', true) then
        raise exception 'Invalid Android push device registration';
    end if;

    -- A device signing into another account takes ownership of its one installation token.
    delete from public.calendar_message_push_devices
    where expo_push_token = p_expo_push_token and device_id <> p_device_id;

    insert into public.calendar_message_push_devices (device_id, user_id, expo_push_token, last_seen_at)
    values (p_device_id, current_user_id, p_expo_push_token, now())
    on conflict (device_id) do update
    set user_id = excluded.user_id,
        expo_push_token = excluded.expo_push_token,
        last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.register_calendar_message_push_device(text, text)
    from public, anon;
grant execute on function public.register_calendar_message_push_device(text, text) to authenticated;

create or replace function public.unregister_calendar_message_push_device(p_device_id text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null then
        delete from public.calendar_message_push_devices
        where device_id = p_device_id and user_id = auth.uid();
    end if;
end;
$$;

revoke all on function public.unregister_calendar_message_push_device(text) from public, anon;
grant execute on function public.unregister_calendar_message_push_device(text) to authenticated;

create or replace function public.dispatch_calendar_message_pushes()
returns void
language plpgsql security definer set search_path = '' as $$
declare
    delivery record;
    ticket jsonb;
    ticket_error text;
    response_error text;
    access_token text;
    request_headers jsonb;
    expo_request_id bigint;
    expo_token text;
    entry_title text;
    receipt_error text;
begin
    -- Cancel work that is no longer represented by the owner's current reminder settings.
    update public.calendar_message_push_deliveries d
    set status = 'cancelled',
        last_error = 'Reminder, entry, or device is no longer current',
        updated_at = now()
    where d.status in ('pending', 'retry')
      and not exists (
          select 1
          from public.calendar_entries e
          join public.calendar_entry_settings s on s.entry_id = e.id
          join public.calendar_message_push_devices p
            on p.user_id = d.user_id and p.device_id = d.device_id
          where e.id = d.entry_id
            and e.starts_at = d.starts_at
            and e.ends_at > now()
            and not e._deleted
            and s.user_id = d.user_id
            and not s._deleted
            and d.reminder_minutes::text || ':message' = any(s.notifications)
      );

    -- One outbox row per current owner reminder and installation, even if synced settings
    -- contain duplicate documents from more than one device.
    insert into public.calendar_message_push_deliveries as existing (
        user_id, entry_id, device_id, starts_at, reminder_minutes, due_at
    )
    select distinct
        s.user_id,
        e.id,
        p.device_id,
        e.starts_at,
        valid.reminder_minutes,
        e.starts_at - valid.reminder_minutes * interval '1 minute'
    from public.calendar_entries e
    join public.calendar_entry_settings s
      on s.entry_id = e.id and not s._deleted
    join public.calendar_message_push_devices p on p.user_id = s.user_id
    cross join lateral unnest(s.notifications) as reminder(value)
    cross join lateral (
        select case
            when reminder.value ~ '^[0-9]+:message$'
              and length(split_part(reminder.value, ':', 1)) <= 10
            then split_part(reminder.value, ':', 1)::numeric
        end as offset_minutes
    ) parsed
    cross join lateral (
        select case
            when parsed.offset_minutes between 0 and 2147483647
            then parsed.offset_minutes::integer
        end as reminder_minutes
    ) valid
    where not e._deleted
      and e.ends_at > now()
      and valid.reminder_minutes is not null
      and e.starts_at - valid.reminder_minutes * interval '1 minute' <= now()
    on conflict (user_id, entry_id, starts_at, reminder_minutes, device_id) do update
    set status = 'pending',
        due_at = excluded.due_at,
        next_attempt_at = now(),
        last_error = null,
        updated_at = now()
    where existing.status = 'cancelled' and existing.attempts = 0;

    -- Resolve Expo's asynchronous tickets before deciding whether a delivery succeeded or
    -- should be retried.
    for delivery in
        select d.id, d.attempts, d.user_id, d.device_id, d.sent_token,
               r.status_code, r.content, r.error_msg, r.timed_out
        from public.calendar_message_push_deliveries d
        join net._http_response r on r.id = d.request_id
        where d.status = 'sending' and d.request_id is not null
        for update of d skip locked
    loop
        ticket := null;
        response_error := delivery.error_msg;
        if delivery.content is not null then
            begin
                ticket := delivery.content::jsonb -> 'data';
                if jsonb_typeof(ticket) = 'array' then
                    ticket := ticket -> 0;
                end if;
            exception when others then
                ticket := null;
            end;
        end if;
        ticket_error := coalesce(ticket -> 'details' ->> 'error', ticket ->> 'message');

        if delivery.status_code between 200 and 299
            and ticket ->> 'status' = 'ok'
            and ticket ->> 'id' is not null then
            update public.calendar_message_push_deliveries
            set status = 'receipt_pending',
                request_id = null,
                receipt_id = ticket ->> 'id',
                receipt_attempts = 0,
                next_attempt_at = now() + interval '15 minutes',
                last_error = null, updated_at = now()
            where id = delivery.id;
        elsif ticket_error = 'DeviceNotRegistered' then
            delete from public.calendar_message_push_devices
            where device_id = delivery.device_id
              and user_id = delivery.user_id
              and expo_push_token = delivery.sent_token;
            update public.calendar_message_push_deliveries
            set status = 'failed', request_id = null, sent_token = null,
                last_error = 'Expo reports that this device token is no longer registered',
                updated_at = now()
            where id = delivery.id;
        elsif delivery.attempts >= 8 then
            update public.calendar_message_push_deliveries
            set status = 'failed', request_id = null, sent_token = null,
                last_error = left(coalesce(ticket_error, response_error, 'Expo push request failed'), 1000),
                updated_at = now()
            where id = delivery.id;
        elsif delivery.status_code is null
            or delivery.timed_out
            or delivery.status_code = 429
            or delivery.status_code >= 500
            or ticket_error in ('MessageRateExceeded', 'ExpoServerError', 'ProviderError') then
            update public.calendar_message_push_deliveries
            set status = 'retry',
                request_id = null,
                sent_token = null,
                next_attempt_at = now() + make_interval(secs => least(3600, (60 * power(2, attempts))::integer)),
                last_error = left(coalesce(ticket_error, response_error, 'Temporary Expo push failure'), 1000),
                updated_at = now()
            where id = delivery.id;
        else
            update public.calendar_message_push_deliveries
            set status = 'failed', request_id = null, sent_token = null,
                last_error = left(coalesce(ticket_error, response_error, 'Expo rejected the push request'), 1000),
                updated_at = now()
            where id = delivery.id;
        end if;
    end loop;

    for delivery in
        select d.id, d.user_id, d.device_id, d.sent_token, d.receipt_id,
               d.receipt_attempts,
               r.status_code, r.content, r.error_msg, r.timed_out
        from public.calendar_message_push_deliveries d
        join net._http_response r on r.id = d.receipt_request_id
        where d.status = 'receipt_sending' and d.receipt_request_id is not null
        for update of d skip locked
    loop
        ticket := null;
        response_error := delivery.error_msg;
        if delivery.content is not null then
            begin
                ticket := delivery.content::jsonb -> 'data' -> delivery.receipt_id;
            exception when others then
                ticket := null;
            end;
        end if;
        receipt_error := coalesce(ticket -> 'details' ->> 'error', ticket ->> 'message');

        if delivery.status_code between 200 and 299 and ticket ->> 'status' = 'ok' then
            update public.calendar_message_push_deliveries
            set status = 'sent', receipt_request_id = null, sent_token = null,
                last_error = null, updated_at = now()
            where id = delivery.id;
        elsif receipt_error = 'DeviceNotRegistered' then
            delete from public.calendar_message_push_devices
            where device_id = delivery.device_id
              and user_id = delivery.user_id
              and expo_push_token = delivery.sent_token;
            update public.calendar_message_push_deliveries
            set status = 'failed', receipt_request_id = null, sent_token = null,
                last_error = 'Expo reports that this device token is no longer registered',
                updated_at = now()
            where id = delivery.id;
        elsif delivery.status_code between 200 and 299 and ticket is null then
            update public.calendar_message_push_deliveries
            set status = case when delivery.receipt_attempts >= 24 then 'failed' else 'receipt_pending' end,
                receipt_request_id = null,
                next_attempt_at = now() + interval '15 minutes',
                last_error = case
                    when delivery.receipt_attempts >= 24 then 'Expo receipt was unavailable after 24 checks'
                    else 'Expo receipt is not available yet'
                end,
                sent_token = case when delivery.receipt_attempts >= 24 then null else sent_token end,
                updated_at = now()
            where id = delivery.id;
        elsif delivery.status_code is null
            or delivery.timed_out
            or delivery.status_code = 429
            or delivery.status_code >= 500
            or receipt_error in ('MessageRateExceeded', 'ExpoServerError', 'ProviderError') then
            update public.calendar_message_push_deliveries
            set status = case when delivery.receipt_attempts >= 24 then 'failed' else 'receipt_pending' end,
                receipt_request_id = null,
                next_attempt_at = now() + interval '5 minutes',
                last_error = left(coalesce(receipt_error, response_error, 'Temporary Expo receipt failure'), 1000),
                sent_token = case when delivery.receipt_attempts >= 24 then null else sent_token end,
                updated_at = now()
            where id = delivery.id;
        else
            update public.calendar_message_push_deliveries
            set status = 'failed', receipt_request_id = null, sent_token = null,
                last_error = left(coalesce(receipt_error, response_error, 'Expo rejected the receipt request'), 1000),
                updated_at = now()
            where id = delivery.id;
        end if;
    end loop;

    update public.calendar_message_push_deliveries d
    set status = case when d.attempts >= 8 then 'failed' else 'retry' end,
        request_id = null,
        sent_token = null,
        next_attempt_at = now() + interval '1 minute',
        last_error = 'Expo push request produced no response within 15 minutes',
        updated_at = now()
    where d.status = 'sending'
      and d.request_id is not null
      and d.updated_at < now() - interval '15 minutes'
      and not exists (
          select 1 from net._http_response r where r.id = d.request_id
      );

    update public.calendar_message_push_deliveries d
    set status = case when d.receipt_attempts >= 24 then 'failed' else 'receipt_pending' end,
        receipt_request_id = null,
        next_attempt_at = now() + interval '15 minutes',
        last_error = case
            when d.receipt_attempts >= 24 then 'Expo receipt request produced no response after 24 checks'
            else 'Expo receipt request produced no response within 15 minutes'
        end,
        sent_token = case when d.receipt_attempts >= 24 then null else d.sent_token end,
        updated_at = now()
    where d.status = 'receipt_sending'
      and d.receipt_request_id is not null
      and d.updated_at < now() - interval '15 minutes'
      and not exists (
          select 1 from net._http_response r where r.id = d.receipt_request_id
      );

    access_token := public.backend_secret('grouploop_expo_push_access_token');
    request_headers := jsonb_build_object(
        'Accept', 'application/json',
        'Content-Type', 'application/json',
        'Accept-Encoding', 'gzip, deflate'
    );
    if access_token is not null and access_token <> '' then
        request_headers := request_headers || jsonb_build_object('Authorization', 'Bearer ' || access_token);
    end if;

    for delivery in
        select d.id, d.receipt_id, d.receipt_attempts
        from public.calendar_message_push_deliveries d
        where d.status = 'receipt_pending'
          and d.next_attempt_at <= now()
        order by d.next_attempt_at, d.id
        limit 100
        for update skip locked
    loop
        if delivery.receipt_attempts >= 24 then
            update public.calendar_message_push_deliveries
            set status = 'failed', sent_token = null,
                last_error = 'Expo receipt was unavailable after 24 checks',
                updated_at = now()
            where id = delivery.id;
            continue;
        end if;

        begin
            expo_request_id := net.http_post(
                url := 'https://exp.host/--/api/v2/push/getReceipts',
                headers := request_headers,
                body := jsonb_build_object('ids', jsonb_build_array(delivery.receipt_id)),
                timeout_milliseconds := 10000
            );
            update public.calendar_message_push_deliveries
            set status = 'receipt_sending',
                receipt_attempts = receipt_attempts + 1,
                receipt_request_id = expo_request_id,
                updated_at = now()
            where id = delivery.id;
        exception when others then
            update public.calendar_message_push_deliveries
            set status = case when receipt_attempts >= 23 then 'failed' else 'receipt_pending' end,
                receipt_attempts = receipt_attempts + 1,
                next_attempt_at = now() + interval '5 minutes',
                sent_token = case when receipt_attempts >= 23 then null else sent_token end,
                last_error = left(sqlerrm, 1000),
                updated_at = now()
            where id = delivery.id;
        end;
    end loop;

    for delivery in
        select d.*
        from public.calendar_message_push_deliveries d
        where d.status in ('pending', 'retry')
          and d.due_at <= now()
          and d.next_attempt_at <= now()
        order by d.due_at, d.id
        limit 100
        for update skip locked
    loop
        -- Re-check current entry, owner's message setting, and token immediately before dispatch.
        select e.title, p.expo_push_token
        into entry_title, expo_token
        from public.calendar_entries e
        join public.calendar_entry_settings s
          on s.entry_id = e.id and s.user_id = delivery.user_id and not s._deleted
        join public.calendar_message_push_devices p
          on p.user_id = delivery.user_id and p.device_id = delivery.device_id
        where e.id = delivery.entry_id
          and e.starts_at = delivery.starts_at
          and e.ends_at > now()
          and not e._deleted
          and delivery.reminder_minutes::text || ':message' = any(s.notifications)
        limit 1;

        if not found then
            update public.calendar_message_push_deliveries
            set status = 'cancelled',
                last_error = 'Reminder, entry, or device changed before dispatch',
                updated_at = now()
            where id = delivery.id;
            continue;
        end if;

        begin
            expo_request_id := net.http_post(
                url := 'https://exp.host/--/api/v2/push/send',
                headers := request_headers,
                body := jsonb_build_array(jsonb_build_object(
                    'to', expo_token,
                    'title', entry_title,
                    'body', case
                        when delivery.reminder_minutes = 0 then entry_title || ' starts now'
                        when delivery.starts_at <= now() then entry_title || ' has started'
                        else entry_title || ' starts in ' || delivery.reminder_minutes || ' minute'
                            || case when delivery.reminder_minutes = 1 then '' else 's' end
                    end,
                    'priority', 'high',
                    'sound', 'default',
                    'channelId', 'calendar-reminders',
                    'ttl', 300,
                    'data', jsonb_build_object('entryId', delivery.entry_id)
                )),
                timeout_milliseconds := 10000
            );
            update public.calendar_message_push_deliveries
            set status = 'sending',
                attempts = attempts + 1,
                request_id = expo_request_id,
                sent_token = expo_token,
                last_error = null,
                updated_at = now()
            where id = delivery.id;
        exception when others then
            if delivery.attempts >= 8 then
                update public.calendar_message_push_deliveries
                set status = 'failed',
                    last_error = left(sqlerrm, 1000),
                    updated_at = now()
                where id = delivery.id;
            else
                update public.calendar_message_push_deliveries
                set status = 'retry',
                    attempts = attempts + 1,
                    next_attempt_at = now() + make_interval(secs => least(3600, (60 * power(2, attempts))::integer)),
                    last_error = left(sqlerrm, 1000),
                    updated_at = now()
                where id = delivery.id;
            end if;
        end;
    end loop;
end;
$$;

revoke all on function public.dispatch_calendar_message_pushes() from public, anon, authenticated;

do $$
declare
    previous_job_id bigint;
begin
    for previous_job_id in
        select jobid from cron.job where jobname = 'grouploop-calendar-message-push'
    loop
        perform cron.unschedule(previous_job_id);
    end loop;
    perform cron.schedule(
        'grouploop-calendar-message-push',
        '* * * * *',
        'select public.dispatch_calendar_message_pushes()'
    );
end;
$$;
