ALTER TABLE public.brand_tenants
  ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gate_preset text NOT NULL DEFAULT 'fenrir-dark';