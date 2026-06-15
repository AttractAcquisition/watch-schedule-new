-- Backfill vessel_members for vessels that pre-date the new schema.
-- For every existing vessel, ensure the owner has a captain_admin row.
insert into public.vessel_members (vessel_id, user_id, role)
select id, owner_id, 'captain_admin'
from public.vessels
on conflict (vessel_id, user_id) do nothing;

-- Backfill watch_settings for vessels that pre-date the new schema.
-- The handle_new_vessel trigger only fires on INSERT; existing rows need this manually.
insert into public.watch_settings (vessel_id)
select id from public.vessels
on conflict (vessel_id) do nothing;

-- Backfill subscriptions for users who exist in auth.users but pre-date handle_new_user.
insert into public.subscriptions (user_id, status)
select id, 'inactive'
from auth.users
on conflict do nothing;
