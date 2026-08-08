CREATE TABLE public.brand_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL UNIQUE,
  name text NOT NULL,
  hostnames text[] NOT NULL DEFAULT '{}'::text[],
  providers text[] NOT NULL DEFAULT ARRAY['apple','google','microsoft']::text[],
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo_url text,
  wordmark_url text,
  community_id text NOT NULL,
  community_label text,
  terminal_command text NOT NULL DEFAULT 'login',
  after_login_path text NOT NULL DEFAULT '/dashboard',
  oauth_return_path text NOT NULL DEFAULT '/',
  site_url text,
  terms_url text NOT NULL DEFAULT '/terms',
  privacy_url text NOT NULL DEFAULT '/privacy',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.brand_tenants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_tenants TO authenticated;
GRANT ALL ON public.brand_tenants TO service_role;

ALTER TABLE public.brand_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand tenants are publicly readable"
  ON public.brand_tenants FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "staff insert brand tenants"
  ON public.brand_tenants FOR INSERT
  TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff update brand tenants"
  ON public.brand_tenants FOR UPDATE
  TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff delete brand tenants"
  ON public.brand_tenants FOR DELETE
  TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE TRIGGER update_brand_tenants_updated_at
  BEFORE UPDATE ON public.brand_tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.gate_configs
  ADD COLUMN brand_id text NOT NULL DEFAULT 'myfenrir',
  ADD COLUMN community_id text;

CREATE INDEX gate_configs_brand_id_idx ON public.gate_configs (brand_id);