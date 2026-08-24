-- Fix live "Bucket not found".
--
-- The deployed community-bridge app runs against Supabase project
-- yqevglppbhuoxxfsfnih (VITE_SUPABASE_URL in .env) and calls
-- storage.from('gate-media') and storage.from('brand-assets'). Those buckets were
-- only ever created in the OTHER Lovable project (jgktxeabubmkxkhlftkg, the ref in
-- supabase/config.toml). In the runtime project only lore-media / profile-media
-- existed, so every gate/brand storage call returned HTTP 404 "Bucket not found".
--
-- This creates the buckets in the runtime project. Both are PRIVATE: reads are
-- streamed through the /gate-media/ and /brand-asset/ server routes using the
-- service role, and public buckets are disabled for this workspace.
--
-- NOTE (split-brain): the community schema (public.app_role, is_staff, brand/gate
-- tables) lives in jgktxeabubmkxkhlftkg, not here. brand-assets' original policies
-- gate writes on private.is_staff(), which does not exist in this project, so no
-- client write policy is created for it here (fail closed). Reconciling which
-- project is canonical is a separate, owner-level decision.

insert into storage.buckets (id, name, public)
values ('gate-media', 'gate-media', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

-- gate-media: owner-scoped client writes (owner = auth.uid(); first path segment
-- must equal the uploader's uid) — identical to the original gate-media migration.
drop policy if exists "gate_media_owner_read" on storage.objects;
create policy "gate_media_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'gate-media' and owner = auth.uid());

drop policy if exists "gate_media_owner_insert" on storage.objects;
create policy "gate_media_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'gate-media' and owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "gate_media_owner_update" on storage.objects;
create policy "gate_media_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'gate-media' and owner = auth.uid())
  with check (bucket_id = 'gate-media' and owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "gate_media_owner_delete" on storage.objects;
create policy "gate_media_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gate-media' and owner = auth.uid());
