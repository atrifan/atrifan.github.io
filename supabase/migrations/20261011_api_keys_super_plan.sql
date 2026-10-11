-- Allow the Clerk Billing "super" plan on api_keys.plan.
-- The original inline CHECK from 001_create_mcp_tables.sql only allowed free/pro/plus.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'api_keys'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE public.api_keys DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_plan_check CHECK (plan IN ('free', 'pro', 'plus', 'super'));
