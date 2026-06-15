-- Make is_vessel_member and is_vessel_admin check BOTH vessel_members rows
-- AND vessels.owner_id so that existing vessel owners are never locked out
-- regardless of whether the vessel_members backfill completed.

create or replace function public.is_vessel_member(p_vessel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from vessel_members
      where vessel_id = p_vessel_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from vessels
      where id = p_vessel_id
        and owner_id = auth.uid()
    );
$$;

create or replace function public.is_vessel_admin(p_vessel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from vessel_members
      where vessel_id = p_vessel_id
        and user_id = auth.uid()
        and role in ('captain_admin', 'first_officer', 'admin')
    )
    or exists (
      select 1 from vessels
      where id = p_vessel_id
        and owner_id = auth.uid()
    );
$$;

-- Re-run the vessel_members backfill without the ON CONFLICT clause
-- in case the old watch_settings table has no unique index on vessel_id.
insert into public.vessel_members (vessel_id, user_id, role)
select v.id, v.owner_id, 'captain_admin'
from public.vessels v
where not exists (
  select 1 from public.vessel_members vm
  where vm.vessel_id = v.id and vm.user_id = v.owner_id
);
