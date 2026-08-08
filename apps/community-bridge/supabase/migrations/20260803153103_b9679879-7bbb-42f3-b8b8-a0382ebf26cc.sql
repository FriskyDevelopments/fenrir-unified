ALTER TABLE public.gate_configs DROP CONSTRAINT IF EXISTS gate_configs_user_unique;
CREATE INDEX IF NOT EXISTS gate_configs_user_id_idx ON public.gate_configs (user_id);