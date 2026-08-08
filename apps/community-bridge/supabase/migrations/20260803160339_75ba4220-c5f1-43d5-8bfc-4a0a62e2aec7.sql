ALTER TABLE public.gate_views ADD COLUMN IF NOT EXISTS visitor_key text;

CREATE UNIQUE INDEX IF NOT EXISTS gate_views_gate_visitor_day_uniq
  ON public.gate_views (gate_id, visitor_key)
  WHERE visitor_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS gate_views_gate_viewed_at_idx
  ON public.gate_views (gate_id, viewed_at DESC);