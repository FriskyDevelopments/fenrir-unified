CREATE POLICY "gate_media_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gate-media' AND owner = auth.uid());

CREATE POLICY "gate_media_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gate-media' AND owner = auth.uid() AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "gate_media_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'gate-media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'gate-media' AND owner = auth.uid() AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "gate_media_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gate-media' AND owner = auth.uid());