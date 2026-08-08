CREATE TABLE public.brand_tenant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  brand_id text NOT NULL,
  tenant_name text,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.brand_tenant_audit TO authenticated;
GRANT ALL ON public.brand_tenant_audit TO service_role;

ALTER TABLE public.brand_tenant_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read brand tenant audit"
  ON public.brand_tenant_audit FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert brand tenant audit"
  ON public.brand_tenant_audit FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND actor_id = auth.uid());

CREATE INDEX brand_tenant_audit_created_at_idx
  ON public.brand_tenant_audit (created_at DESC);
CREATE INDEX brand_tenant_audit_brand_id_idx
  ON public.brand_tenant_audit (brand_id, created_at DESC);