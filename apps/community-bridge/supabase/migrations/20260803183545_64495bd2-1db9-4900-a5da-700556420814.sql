ALTER TABLE public.brand_tenants
  ADD COLUMN IF NOT EXISTS login_signin_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS login_signup_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS login_forgot_label text NOT NULL DEFAULT '';