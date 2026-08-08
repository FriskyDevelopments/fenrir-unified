ALTER TABLE public.brand_tenants
  ADD COLUMN IF NOT EXISTS activate_headline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS activate_subheadline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS activate_steps_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS activate_bot_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS activate_submit_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS activate_success_headline text NOT NULL DEFAULT '';