-- ============================================================
-- Watch Schedule — Clean Production Schema
-- 2026-06-14
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_stat_statements";

-- ── Helper functions (SECURITY DEFINER, schema-qualified) ────────────────────

-- Returns the vessel_id of the currently authenticated user (first vessel they own or are member of)
create or replace function public.get_user_vessel_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.id
  from vessels v
  join vessel_members vm on vm.vessel_id = v.id
  where vm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_vessel_member(p_vessel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vessel_members
    where vessel_id = p_vessel_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_vessel_admin(p_vessel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vessel_members
    where vessel_id = p_vessel_id
      and user_id = auth.uid()
      and role in ('captain_admin', 'first_officer', 'admin')
  );
$$;

-- ── Tables ────────────────────────────────────────────────────────────────────

-- Profiles (mirrors auth.users)
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  full_name    text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Subscriptions (written only by stripe-webhook via service_role)
create table if not exists public.subscriptions (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users on delete cascade,
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  plan_type             text not null default 'solo_watch'
                          check (plan_type in ('solo_watch', 'dual_watch', 'triple_watch')),
  status                text not null default 'inactive'
                          check (status in ('inactive', 'trialing', 'active', 'past_due', 'cancelled')),
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Vessels
create table if not exists public.vessels (
  id                    uuid primary key default uuid_generate_v4(),
  owner_id              uuid not null references auth.users on delete cascade,
  name                  text not null,
  length_range          text,
  length_meters         numeric,
  operation_type        text default 'private'
                          check (operation_type in ('private', 'charter', 'private_charter')),
  timezone              text not null default 'UTC',
  plan_type             text default 'solo_watch'
                          check (plan_type in ('solo_watch', 'dual_watch', 'triple_watch')),
  watch_mode            text default 'solo'
                          check (watch_mode in ('solo', 'dual', 'triple')),
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Vessel members (who can access a vessel)
create table if not exists public.vessel_members (
  id         uuid primary key default uuid_generate_v4(),
  vessel_id  uuid not null references public.vessels on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null default 'crew'
               check (role in ('captain_admin', 'first_officer', 'admin', 'crew', 'viewer')),
  created_at timestamptz not null default now(),
  unique (vessel_id, user_id)
);

-- Crew members
create table if not exists public.crew_members (
  id                    uuid primary key default uuid_generate_v4(),
  vessel_id             uuid not null references public.vessels on delete cascade,
  full_name             text not null,
  position              text,
  rank                  text,
  department            text not null default 'unassigned'
                          check (department in ('command', 'deck', 'interior', 'engineering', 'unassigned')),
  watch_eligible        boolean not null default true,
  eligible_roles        text[] not null default '{}',
  status                text not null default 'active'
                          check (status in ('active', 'on_leave', 'sick', 'off_vessel', 'training', 'unavailable', 'offboarded')),
  is_rotational         boolean not null default true,
  is_relief             boolean not null default false,
  crew_lifecycle_status text not null default 'active'
                          check (crew_lifecycle_status in ('active', 'joiner', 'leaver', 'archived')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Watch templates
create table if not exists public.watch_templates (
  id              uuid primary key default uuid_generate_v4(),
  vessel_id       uuid not null references public.vessels on delete cascade,
  name            text not null,
  watch_mode      text not null default 'solo'
                    check (watch_mode in ('solo', 'dual', 'triple')),
  watch_blocks    jsonb not null default '[]',
  coverage_rules  jsonb not null default '{}',
  rotation_rules  jsonb not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Watch settings (fairness weights, rules)
create table if not exists public.watch_settings (
  id                  uuid primary key default uuid_generate_v4(),
  vessel_id           uuid not null references public.vessels on delete cascade unique,
  avoid_consecutive   boolean not null default true,
  max_consecutive_days int not null default 3,
  duty_weights        jsonb not null default '{"standard_weekday":1,"monday":1,"friday":1.25,"saturday":1.5,"sunday":1.5,"public_holiday":1.5,"christmas_day":2.5,"christmas_eve":2,"boxing_day":2,"new_years_eve":2.5,"new_years_day":2}',
  excluded_departments text[] not null default '{}',
  weekend_mode        text not null default 'standard'
                        check (weekend_mode in ('standard', 'heavy', 'friday_sunday', 'saturday_sunday', 'custom')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Leave requests (single source of truth for all crew availability exceptions)
create table if not exists public.leave_requests (
  id               uuid primary key default uuid_generate_v4(),
  vessel_id        uuid not null references public.vessels on delete cascade,
  crew_member_id   uuid not null references public.crew_members on delete cascade,
  leave_type       text not null default 'leave'
                     check (leave_type in ('leave', 'sick', 'training', 'off_vessel', 'unavailable')),
  start_date       date not null,
  end_date         date not null,
  status           text not null default 'requested'
                     check (status in ('requested', 'approved', 'denied', 'cancelled')),
  impact_score     int not null default 0,
  forecast_result  jsonb not null default '{}',
  notes            text,
  requested_by     uuid references auth.users,
  approved_by      uuid references auth.users,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Charter pauses
create table if not exists public.charter_pauses (
  id                            uuid primary key default uuid_generate_v4(),
  vessel_id                     uuid not null references public.vessels on delete cascade,
  schedule_run_id               uuid,
  start_date                    date not null,
  end_date                      date not null,
  status                        text not null default 'active'
                                  check (status in ('active', 'completed', 'cancelled')),
  resume_mode                   text not null default 'manual'
                                  check (resume_mode in ('automatic', 'manual')),
  pause_all_watches             boolean not null default true,
  keep_engineering_watch_active boolean not null default false,
  keep_security_watch_active    boolean not null default false,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Schedule runs
create table if not exists public.schedule_runs (
  id              uuid primary key default uuid_generate_v4(),
  vessel_id       uuid not null references public.vessels on delete cascade,
  template_id     uuid references public.watch_templates,
  start_date      date not null,
  end_date        date not null,
  status          text not null default 'draft'
                    check (status in ('draft', 'confirmed', 'archived')),
  watch_mode      text not null default 'solo',
  fairness_score  int,
  health_score    int,
  warnings        jsonb not null default '[]',
  confirmed_by    uuid references auth.users,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Schedule assignments
create table if not exists public.schedule_assignments (
  id                 uuid primary key default uuid_generate_v4(),
  schedule_run_id    uuid not null references public.schedule_runs on delete cascade,
  vessel_id          uuid not null references public.vessels on delete cascade,
  crew_member_id     uuid not null references public.crew_members on delete cascade,
  watch_start        timestamptz not null,
  watch_end          timestamptz not null,
  assignment_date    date,
  role               text not null default 'watchkeeper',
  watch_type         text not null default 'deck',
  is_manual_override boolean not null default false,
  override_reason    text,
  created_at         timestamptz not null default now()
);

-- Crew fairness scores (persisted snapshot after each schedule run)
create table if not exists public.crew_fairness_scores (
  id                   uuid primary key default uuid_generate_v4(),
  vessel_id            uuid not null references public.vessels on delete cascade,
  crew_member_id       uuid not null references public.crew_members on delete cascade,
  schedule_run_id      uuid references public.schedule_runs on delete set null,
  total_watches        int not null default 0,
  weighted_load        numeric not null default 0,
  friday_watches       int not null default 0,
  weekend_watches      int not null default 0,
  holiday_watches      int not null default 0,
  christmas_watches    int not null default 0,
  fairness_debt        int not null default 0,
  crew_fairness_score  int not null default 100,
  calculated_at        timestamptz not null default now()
);

-- Schedule health scores
create table if not exists public.schedule_health_scores (
  id                        uuid primary key default uuid_generate_v4(),
  vessel_id                 uuid not null references public.vessels on delete cascade,
  schedule_run_id           uuid references public.schedule_runs on delete set null,
  schedule_fairness_score   int not null default 0,
  schedule_health_score     int not null default 0,
  rotation_stability_score  int not null default 0,
  coverage_score            int not null default 0,
  calculated_at             timestamptz not null default now()
);

-- Schedule explanations (warnings and alerts from the scheduler)
create table if not exists public.schedule_explanations (
  id                uuid primary key default uuid_generate_v4(),
  vessel_id         uuid not null references public.vessels on delete cascade,
  schedule_run_id   uuid references public.schedule_runs on delete cascade,
  crew_member_id    uuid references public.crew_members on delete set null,
  assignment_date   date,
  explanation_type  text not null default 'info'
                      check (explanation_type in ('info', 'alert', 'warning', 'override')),
  explanation_text  text not null,
  created_at        timestamptz not null default now()
);

-- Manual overrides (audit log for swapped assignments)
create table if not exists public.manual_overrides (
  id                      uuid primary key default uuid_generate_v4(),
  vessel_id               uuid not null references public.vessels on delete cascade,
  schedule_run_id         uuid references public.schedule_runs on delete set null,
  assignment_id           uuid references public.schedule_assignments on delete set null,
  old_crew_member_id      uuid references public.crew_members on delete set null,
  new_crew_member_id      uuid references public.crew_members on delete set null,
  changed_by              uuid references auth.users,
  reason                  text,
  assignment_date         date,
  fairness_impact_before  jsonb not null default '{}',
  fairness_impact_after   jsonb not null default '{}',
  created_at              timestamptz not null default now()
);

-- Export history
create table if not exists public.export_history (
  id                uuid primary key default uuid_generate_v4(),
  vessel_id         uuid not null references public.vessels on delete cascade,
  schedule_run_id   uuid references public.schedule_runs on delete set null,
  export_type       text,
  export_format     text not null default 'pdf',
  file_url          text,
  exported_by       uuid references auth.users,
  created_at        timestamptz not null default now()
);

-- Audit logs
create table if not exists public.audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  vessel_id    uuid references public.vessels on delete cascade,
  user_id      uuid references auth.users,
  action       text not null,
  table_name   text,
  record_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  created_at   timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_vessel_members_user_id       on public.vessel_members (user_id);
create index if not exists idx_crew_members_vessel_id       on public.crew_members (vessel_id);
create index if not exists idx_leave_requests_vessel_id     on public.leave_requests (vessel_id);
create index if not exists idx_leave_requests_crew_id       on public.leave_requests (crew_member_id);
create index if not exists idx_schedule_runs_vessel_id      on public.schedule_runs (vessel_id, created_at desc);
create index if not exists idx_assignments_run_id           on public.schedule_assignments (schedule_run_id);
create index if not exists idx_assignments_date             on public.schedule_assignments (assignment_date);
create index if not exists idx_charter_pauses_vessel_id     on public.charter_pauses (vessel_id);
create index if not exists idx_fairness_scores_vessel_id    on public.crew_fairness_scores (vessel_id);
create index if not exists idx_health_scores_vessel_id      on public.schedule_health_scores (vessel_id, calculated_at desc);
create index if not exists idx_explanations_vessel_id       on public.schedule_explanations (vessel_id);
create index if not exists idx_overrides_vessel_id          on public.manual_overrides (vessel_id);
create index if not exists idx_export_history_vessel_id     on public.export_history (vessel_id, created_at desc);

-- ── Triggers: updated_at ─────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','subscriptions','vessels','vessel_members','crew_members',
    'watch_templates','watch_settings','leave_requests','charter_pauses',
    'schedule_runs'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- ── Trigger: auto-create profile on sign-up ───────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'inactive')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Trigger: auto-create watch_settings for new vessel ───────────────────────
create or replace function public.handle_new_vessel()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.watch_settings (vessel_id) values (new.id)
  on conflict (vessel_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_vessel_created on public.vessels;
create trigger on_vessel_created
  after insert on public.vessels
  for each row execute function public.handle_new_vessel();

-- ── Enable RLS ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.vessels enable row level security;
alter table public.vessel_members enable row level security;
alter table public.crew_members enable row level security;
alter table public.watch_templates enable row level security;
alter table public.watch_settings enable row level security;
alter table public.leave_requests enable row level security;
alter table public.charter_pauses enable row level security;
alter table public.schedule_runs enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.crew_fairness_scores enable row level security;
alter table public.schedule_health_scores enable row level security;
alter table public.schedule_explanations enable row level security;
alter table public.manual_overrides enable row level security;
alter table public.export_history enable row level security;
alter table public.audit_logs enable row level security;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

-- Profiles: users read/write only their own
create policy "profiles_self" on public.profiles for all using (id = auth.uid());

-- Subscriptions: users read their own; writes handled by service_role (stripe-webhook)
create policy "subscriptions_read_own" on public.subscriptions for select using (user_id = auth.uid());

-- Vessels: owner + vessel members can read; only owner can insert; members can update
create policy "vessels_read" on public.vessels for select
  using (owner_id = auth.uid() or public.is_vessel_member(id));

create policy "vessels_insert" on public.vessels for insert
  with check (owner_id = auth.uid());

create policy "vessels_update" on public.vessels for update
  using (public.is_vessel_admin(id));

-- Vessel members
create policy "vessel_members_read" on public.vessel_members for select
  using (public.is_vessel_member(vessel_id));

create policy "vessel_members_insert" on public.vessel_members for insert
  with check (public.is_vessel_admin(vessel_id) or user_id = auth.uid());

create policy "vessel_members_delete" on public.vessel_members for delete
  using (public.is_vessel_admin(vessel_id));

-- Crew members
create policy "crew_read" on public.crew_members for select
  using (public.is_vessel_member(vessel_id));

create policy "crew_write" on public.crew_members for insert
  with check (public.is_vessel_member(vessel_id));

create policy "crew_update" on public.crew_members for update
  using (public.is_vessel_member(vessel_id));

create policy "crew_delete" on public.crew_members for delete
  using (public.is_vessel_admin(vessel_id));

-- Watch templates
create policy "templates_read" on public.watch_templates for select
  using (public.is_vessel_member(vessel_id));

create policy "templates_write" on public.watch_templates for insert
  with check (public.is_vessel_admin(vessel_id));

create policy "templates_update" on public.watch_templates for update
  using (public.is_vessel_admin(vessel_id));

-- Watch settings
create policy "watch_settings_read" on public.watch_settings for select
  using (public.is_vessel_member(vessel_id));

create policy "watch_settings_write" on public.watch_settings for insert
  with check (public.is_vessel_member(vessel_id));

create policy "watch_settings_update" on public.watch_settings for update
  using (public.is_vessel_member(vessel_id));

-- Leave requests
create policy "leave_read" on public.leave_requests for select
  using (public.is_vessel_member(vessel_id));

create policy "leave_write" on public.leave_requests for insert
  with check (public.is_vessel_member(vessel_id));

create policy "leave_update" on public.leave_requests for update
  using (public.is_vessel_member(vessel_id));

create policy "leave_delete" on public.leave_requests for delete
  using (public.is_vessel_admin(vessel_id));

-- Charter pauses
create policy "charter_read" on public.charter_pauses for select
  using (public.is_vessel_member(vessel_id));

create policy "charter_write" on public.charter_pauses for all
  using (public.is_vessel_member(vessel_id));

-- Schedule runs
create policy "schedule_runs_read" on public.schedule_runs for select
  using (public.is_vessel_member(vessel_id));

create policy "schedule_runs_write" on public.schedule_runs for all
  using (public.is_vessel_member(vessel_id));

-- Schedule assignments
create policy "assignments_read" on public.schedule_assignments for select
  using (public.is_vessel_member(vessel_id));

create policy "assignments_write" on public.schedule_assignments for all
  using (public.is_vessel_member(vessel_id));

-- Fairness / health / explanations / overrides (read-only for clients; written by edge functions)
create policy "fairness_read" on public.crew_fairness_scores for select
  using (public.is_vessel_member(vessel_id));

create policy "health_read" on public.schedule_health_scores for select
  using (public.is_vessel_member(vessel_id));

create policy "explanations_read" on public.schedule_explanations for select
  using (public.is_vessel_member(vessel_id));

create policy "overrides_read" on public.manual_overrides for select
  using (public.is_vessel_member(vessel_id));

create policy "overrides_write" on public.manual_overrides for insert
  with check (public.is_vessel_admin(vessel_id));

-- Export history
create policy "exports_read" on public.export_history for select
  using (public.is_vessel_member(vessel_id));
