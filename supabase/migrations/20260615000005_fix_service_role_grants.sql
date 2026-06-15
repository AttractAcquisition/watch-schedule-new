-- Grant full DML access to service_role on all public tables.
-- The old schema never granted service_role beyond REFERENCES/TRIGGER/TRUNCATE,
-- so every edge function using adminClient() was hitting "permission denied".
-- service_role bypasses RLS by design; it still needs explicit GRANT to operate.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Also grant execute on all functions so SECURITY DEFINER functions work correctly.
grant all on all routines in schema public to service_role;
