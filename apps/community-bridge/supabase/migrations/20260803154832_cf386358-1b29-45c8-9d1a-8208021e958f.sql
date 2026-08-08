CREATE TABLE public.gate_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gate_id uuid NOT NULL REFERENCES public.gate_configs(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  referrer_host text
);

CREATE INDEX gate_views_gate_id_viewed_at_idx ON public.gate_views (gate_id, viewed_at DESC);

GRANT SELECT ON public.gate_views TO authenticated;
GRANT ALL ON public.gate_views TO service_role;

ALTER TABLE public.gate_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read views for own gates"
ON public.gate_views
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.gate_configs g
    WHERE g.id = gate_views.gate_id AND g.user_id = auth.uid()
  )
);