-- 1. Ensure private schema exists and is locked down
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- 2. Move admin RPCs into private schema with explicit _caller authorization
CREATE OR REPLACE FUNCTION private.list_users_with_roles(_caller uuid)
RETURNS TABLE(user_id uuid, email text, role public.app_role, telegram_id bigint, created_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _caller IS NULL OR NOT private.is_staff(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING errcode='42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, COALESCE(r.role,'user'::public.app_role), r.telegram_id, u.created_at
    FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
    ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_set_user_telegram_id(_caller uuid, _target uuid, _telegram_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _caller IS NULL OR NOT private.is_staff(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING errcode='42501';
  END IF;
  IF private.is_owner(_target) AND NOT private.is_owner(_caller) THEN
    RAISE EXCEPTION 'only an owner can modify another owner' USING errcode='42501';
  END IF;
  INSERT INTO public.user_roles (user_id, role, telegram_id) VALUES (_target, 'user', _telegram_id)
  ON CONFLICT (user_id) DO UPDATE SET telegram_id = excluded.telegram_id, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_update_user_role(_caller uuid, _target uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller_is_owner boolean := private.is_owner(_caller);
  _caller_is_staff boolean := private.is_staff(_caller);
  _target_is_owner boolean := private.is_owner(_target);
BEGIN
  IF _caller IS NULL OR NOT _caller_is_staff THEN
    RAISE EXCEPTION 'forbidden' USING errcode='42501';
  END IF;
  IF (_role = 'owner' OR _target_is_owner) AND NOT _caller_is_owner THEN
    RAISE EXCEPTION 'only an owner can grant or modify the owner role' USING errcode='42501';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target, _role)
  ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.redeem_telegram_link_code(_caller uuid, _code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tg bigint;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.telegram_link_codes SET consumed_at = now()
   WHERE code = upper(_code) AND consumed_at IS NULL AND expires_at > now()
  RETURNING telegram_id INTO _tg;
  IF _tg IS NULL THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role, telegram_id)
       VALUES (_caller, 'user', _tg)
  ON CONFLICT (user_id) DO UPDATE SET telegram_id = excluded.telegram_id, updated_at = now();
  RETURN true;
END;
$$;

-- 3. Lock down execute on the new private functions
REVOKE ALL ON FUNCTION private.list_users_with_roles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.admin_set_user_telegram_id(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.admin_update_user_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.redeem_telegram_link_code(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.list_users_with_roles(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.admin_set_user_telegram_id(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION private.admin_update_user_role(uuid, uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION private.redeem_telegram_link_code(uuid, text) TO service_role;

-- 4. Drop the public SECURITY DEFINER functions that the linter was flagging
DROP FUNCTION IF EXISTS public.list_users_with_roles();
DROP FUNCTION IF EXISTS public.admin_set_user_telegram_id(uuid, bigint);
DROP FUNCTION IF EXISTS public.admin_update_user_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.redeem_telegram_link_code(text);