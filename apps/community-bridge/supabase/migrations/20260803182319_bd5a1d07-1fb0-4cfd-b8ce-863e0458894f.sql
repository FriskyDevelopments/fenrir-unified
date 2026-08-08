ALTER TABLE public.brand_tenants
  ADD COLUMN IF NOT EXISTS login_headline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS login_subheadline text NOT NULL DEFAULT '';