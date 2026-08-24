-- Gate media is rendered on public, shareable gate pages. Public bucket access
-- affects reads only; owner-scoped INSERT/UPDATE/DELETE policies remain active.
update storage.buckets
set public = true
where id = 'gate-media';
