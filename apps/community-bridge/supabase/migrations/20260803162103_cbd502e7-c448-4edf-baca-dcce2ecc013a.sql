CREATE POLICY "staff read brand assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'brand-assets' AND private.is_staff(auth.uid()));

CREATE POLICY "staff upload brand assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brand-assets' AND private.is_staff(auth.uid()));

CREATE POLICY "staff update brand assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'brand-assets' AND private.is_staff(auth.uid()));

CREATE POLICY "staff delete brand assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND private.is_staff(auth.uid()));