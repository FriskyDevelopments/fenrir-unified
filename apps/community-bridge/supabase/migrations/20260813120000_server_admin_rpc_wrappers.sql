-- Keep private admin helpers out of PostgREST while giving trusted server
-- functions a public-schema, service-role-only bridge. `private` itself must
-- remain unexposed; clients never receive these grants.
CREATE OR REPLACE FUNCTION public.server_list_users_with_roles(_caller uuid)
RETURNS TABLE(user_id uuid, email text, role public.app_role, telegram_id bigint, created_at timestamp with time zone)
LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT * FROM private.list_users_with_roles(_caller);
$$;

CREATE OR REPLACE FUNCTION public.server_admin_update_user_role(_caller uuid, _target uuid, _role public.app_role)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.admin_update_user_role(_caller, _target, _role);
$$;

CREATE OR REPLACE FUNCTION public.server_admin_set_user_telegram_id(_caller uuid, _target uuid, _telegram_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.admin_set_user_telegram_id(_caller, _target, _telegram_id);
$$;

CREATE OR REPLACE FUNCTION public.server_redeem_telegram_link_code(_caller uuid, _code text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.redeem_telegram_link_code(_caller, _code);
$$;

REVOKE ALL ON FUNCTION public.server_list_users_with_roles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_update_user_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_set_user_telegram_id(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_redeem_telegram_link_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_list_users_with_roles(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_update_user_role(uuid, uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_set_user_telegram_id(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_redeem_telegram_link_code(uuid, text) TO service_role;
