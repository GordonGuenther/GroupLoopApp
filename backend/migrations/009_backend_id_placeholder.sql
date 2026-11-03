-- The app tags every local row with the backend it lives on, and never sends that tag. RxDB's
-- Supabase replication still matches every field of the local schema on an update, and checks
-- a missing one with `backend_id is null`. The column keeps that check from failing: it stays
-- empty, as the app does not push it and replaces it on pull.

alter table public.calendar_entries add column if not exists backend_id text;
alter table public.calendar_entry_settings add column if not exists backend_id text;
alter table public.groups add column if not exists backend_id text;
alter table public.group_members add column if not exists backend_id text;
