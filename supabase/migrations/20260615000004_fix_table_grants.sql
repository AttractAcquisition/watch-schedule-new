-- Grant SELECT/INSERT/UPDATE/DELETE to authenticated on tables that were
-- missing these grants (tables created before the new schema migration ran GRANT).
-- The old CREATE TABLE IF NOT EXISTS path kept stale grant structure.

grant select, insert, update, delete on table public.watch_settings         to authenticated;
grant select, insert, update, delete on table public.crew_fairness_scores    to authenticated;
grant select, insert, update, delete on table public.schedule_health_scores  to authenticated;
grant select, insert, update, delete on table public.schedule_explanations   to authenticated;
grant select, insert, update, delete on table public.manual_overrides        to authenticated;
grant select, insert, update, delete on table public.leave_requests          to authenticated;

-- Also ensure anon has no data access (it shouldn't, but be explicit)
-- (anon already lacks SELECT on these tables, no change needed)
