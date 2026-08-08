CREATE TABLE public.gate_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  preset text NOT NULL DEFAULT 'fenrir-dark',
  headline text NOT NULL DEFAULT 'Members only',
  subheadline text NOT NULL DEFAULT 'Sign in to continue to the portal.',
  logo_url text,
  mascot_url text,
  background_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gate_configs_user_unique UNIQUE (user_id),
  CONSTRAINT gate_configs_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
);

GRANT SELECT ON public.gate_configs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gate_configs TO authenticated;
GRANT ALL ON public.gate_configs TO service_role;

ALTER TABLE public.gate_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate configs are publicly readable"
ON public.gate_configs FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "owners insert own gate config"
ON public.gate_configs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owners update own gate config"
ON public.gate_configs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owners delete own gate config"
ON public.gate_configs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_gate_configs_updated_at
BEFORE UPDATE ON public.gate_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();