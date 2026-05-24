-- PREP ONLY — não aplicar sem aprovação explícita (ver docs/RLS_AUDIT_NIGHT_CYCLE.md).
-- Advisor: trip_financials tem RLS enabled sem policies.

-- alter table trip_financials enable row level security;

-- create policy trip_financials_tenant_read on trip_financials
--   for select
--   using (
--     exists (
--       select 1 from trips t
--       where t.id = trip_financials.trip_id
--         and t.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
--     )
--   );

-- create policy trip_financials_finance_write on trip_financials
--   for all
--   using (
--     (auth.jwt() ->> 'role') in ('admin', 'financeiro')
--     and exists (
--       select 1 from trips t
--       where t.id = trip_financials.trip_id
--         and t.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
--     )
--   );
