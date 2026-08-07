-- Community Gate showroom brands — seed
--
-- Rescatado de ~/Documents/Playground/frisky-spark-lab, donde estas tres marcas
-- vivian cableadas en un switch por slug dentro de src/App.tsx
-- (`showroomProfileForSlug`). Nuestro gate ya lee la marca de la base
-- (`GET /api/community-auth/brand/:slug` -> ensureCommunityBrandPayload), asi que
-- aqui son simplemente filas y el codigo no se toca.
--
-- Idempotente: se puede aplicar las veces que haga falta.
--
--   psql "$NEON_DATABASE_URL" -f docs/neon-community-showroom-seed.sql
--
-- Requiere docs/neon-community-auth-schema.sql aplicado antes.
--
-- NO SOBREESCRIBE. Si el slug ya existe la fila se deja intacta, para no pisar lo
-- que un owner haya cambiado en el wizard. Para forzar un refresco, borra la fila
-- (delete from fenrir_gate_communities where slug = '...') y vuelve a aplicar.
--
-- Lo que NO viaja: el perfil del lab tambien traia `body`, `marker`, `inviteBody`,
-- `trustB`, `trustC` y `button`. Ninguno tiene columna en fenrir_gate_communities
-- — ese copy sale de src/i18n.ts en nuestro gate. Se pierden a proposito; si
-- alguna vez hacen falta por comunidad, necesitan columnas nuevas.
--
-- enabled_auth_providers queda en magic_link: es el unico metodo que funciona sin
-- credenciales de proveedor. Google/Microsoft/Apple se encienden por comunidad
-- desde el wizard (Access -> Login methods) cuando existan las credenciales
-- (ver docs/COMMUNITY_OAUTH_RUNBOOK.md). El lab usaba 'clerk_trial', que este
-- bridge no soporta.
--
-- Los assets viven en public/showrooms/ (copiados del lab en este mismo commit).

begin;

-- 1) Una org por showroom. ensureCommunityBrandPayload() exige un org_id: sin el,
--    cualquier login contra ese slug muere con `community_org_required`.
insert into fenrir_community_orgs (slug, name)
values
  ('pigbros-partynplay',      'Pig''Bros PartyN''Play VIP'),
  ('crystal-clear-connection','The Crystal Clear Connection'),
  ('haus-of-howl-syndicates', 'Haus of Howl')
on conflict (slug) do nothing;

-- 2) La marca que pinta la puerta publica /community/<slug>.
insert into fenrir_gate_communities (
  org_id,
  slug,
  name,
  logo_url,
  background_url,
  primary_color,
  secondary_color,
  accent_color,
  headline,
  subheadline,
  invite_prefix,
  enabled_auth_providers,
  default_access_state
)
select
  o.id,
  s.slug,
  s.name,
  s.logo_url,
  s.background_url,
  s.primary_color,
  s.secondary_color,
  s.accent_color,
  s.headline,
  s.subheadline,
  s.slug,
  array['magic_link'],
  'pending'          -- 'provisional' en el wizard: entra, pero pendiente de aprobacion
from (
  values
    (
      'pigbros-partynplay',
      'Pig''Bros PartyN''Play VIP',
      '/showrooms/fenrir-logo-reveal.gif',
      '/showrooms/pigbros-party-n-play.jpg',
      '#ff6cce', '#25d9ff', '#f7df72',
      'Pig''Bros PartyN''Play VIP opens through a premium Fenrir gate.',
      'Cosmic lo-fi grooves, private chat, and VC access for the Pig JaviiTorres community.'
    ),
    (
      'crystal-clear-connection',
      'The Crystal Clear Connection',
      '/showrooms/fenrir-neon-mark.png',
      '/showrooms/crystal-clear-connection.jpg',
      '#5fb8ff', '#8fd7ff', '#d9eef8',
      'The Crystal Clear Connection opens through a discreet premium gate.',
      'Real connection, private community access, and a clean protected entry lane.'
    ),
    (
      'haus-of-howl-syndicates',
      'Haus of Howl',
      '/showrooms/haus-of-howl-auth.png',
      '/showrooms/haus-of-howl-pack.gif',
      '#2aa8ff', '#8a4cff', '#f2f7ff',
      'Haus of Howl opens through the Fenrir preview showroom.',
      'Wolf-pack neon, one community identity, one private trust lane.'
    )
) as s (
  slug, name, logo_url, background_url,
  primary_color, secondary_color, accent_color,
  headline, subheadline
)
join fenrir_community_orgs o on o.slug = s.slug
on conflict (slug) do nothing;

commit;

-- Comprobacion:
--   select slug, name, org_id is not null as has_org, enabled_auth_providers
--   from fenrir_gate_communities
--   where slug in ('pigbros-partynplay','crystal-clear-connection','haus-of-howl-syndicates');
--
-- El lab trataba 'pigbros-party-n-play' y 'haus-of-howl' como alias del mismo
-- showroom. Aqui no se siembran: fenrir_gate_communities.slug es unique y serian
-- filas duplicadas, no alias. Si hacen falta, van como redireccion en el router,
-- no como fila.
