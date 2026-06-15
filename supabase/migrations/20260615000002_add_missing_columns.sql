-- Add columns that exist in the new schema but were absent from the old tables.
-- All changes are additive (ADD COLUMN IF NOT EXISTS) so existing data is preserved.

-- ── schedule_runs ─────────────────────────────────────────────────────────────
alter table public.schedule_runs
  add column if not exists watch_mode   text not null default 'solo',
  add column if not exists health_score int;

-- ── schedule_assignments ──────────────────────────────────────────────────────
-- Old table used watch_role / duty_type / duty_weight; new code uses role / watch_type.
alter table public.schedule_assignments
  add column if not exists role       text not null default 'watchkeeper',
  add column if not exists watch_type text not null default 'deck';

-- Backfill role/watch_type from the old columns where they exist
update public.schedule_assignments
set
  role       = coalesce(watch_role, 'watchkeeper'),
  watch_type = coalesce(duty_type, 'deck')
where role = 'watchkeeper' and watch_type = 'deck';

-- ── watch_settings ────────────────────────────────────────────────────────────
alter table public.watch_settings
  add column if not exists avoid_consecutive    boolean not null default true,
  add column if not exists max_consecutive_days int     not null default 3,
  add column if not exists excluded_departments text[]  not null default '{}';

-- ── crew_fairness_scores ──────────────────────────────────────────────────────
-- Old column names: total_duties, friday_duties, weekend_duties,
--                   public_holiday_duties, christmas_new_year_duties
-- New column names: total_watches, friday_watches, weekend_watches,
--                   holiday_watches, christmas_watches, weighted_load, fairness_debt
alter table public.crew_fairness_scores
  add column if not exists total_watches     int     not null default 0,
  add column if not exists weighted_load     numeric not null default 0,
  add column if not exists friday_watches    int     not null default 0,
  add column if not exists weekend_watches   int     not null default 0,
  add column if not exists holiday_watches   int     not null default 0,
  add column if not exists christmas_watches int     not null default 0;

-- Backfill new columns from old columns where old columns exist
update public.crew_fairness_scores
set
  total_watches     = coalesce(total_duties, 0),
  friday_watches    = coalesce(friday_duties, 0),
  weekend_watches   = coalesce(weekend_duties, 0),
  holiday_watches   = coalesce(public_holiday_duties, 0),
  christmas_watches = coalesce(christmas_new_year_duties, 0)
where total_watches = 0;

-- ── subscriptions: add cancel_at_period_end if missing ───────────────────────
alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists current_period_start  timestamptz;
