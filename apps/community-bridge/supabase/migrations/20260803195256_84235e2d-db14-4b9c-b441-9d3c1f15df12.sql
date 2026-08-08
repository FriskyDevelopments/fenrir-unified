ALTER TABLE public.brand_tenants
  ADD COLUMN IF NOT EXISTS login_terminal_header text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS login_terminal_lines text[] NOT NULL DEFAULT '{}'::text[];