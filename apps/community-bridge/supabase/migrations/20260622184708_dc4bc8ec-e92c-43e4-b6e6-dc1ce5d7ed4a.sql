
-- 1. Create private schema, not exposed via PostgREST
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- 2. Recreate helper functions in private schema (SECURITY DEFINER stays, but unreachable via API)
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
$$;

CREATE OR REPLACE FUNCTION private.is_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner')
$$;

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, telegram_id)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email = 'babaji.alvarez@gmail.com' THEN 'owner'::public.app_role
         ELSE 'user'::public.app_role END,
    CASE WHEN NEW.email = 'babaji.alvarez@gmail.com' THEN 8581086019::bigint ELSE NULL END
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Update RLS policy on user_roles to reference private.is_staff
DROP POLICY IF EXISTS "self or staff can read" ON public.user_roles;
CREATE POLICY "self or staff can read" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR private.is_staff(auth.uid()));

-- 4. Recreate trigger on auth.users to use private.handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- 5. Update public admin RPCs to call private.* helpers, and retain SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE(user_id uuid, email text, role public.app_role, telegram_id bigint, created_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, COALESCE(r.role,'user'::public.app_role), r.telegram_id, u.created_at
    FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
    ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_telegram_id(_target uuid, _telegram_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF private.is_owner(_target) AND NOT private.is_owner(_caller) THEN
    RAISE EXCEPTION 'only an owner can modify another owner' USING errcode='42501';
  END IF;
  INSERT INTO public.user_roles (user_id, role, telegram_id) VALUES (_target, 'user', _telegram_id)
  ON CONFLICT (user_id) DO UPDATE SET telegram_id = excluded.telegram_id, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_role(_target uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid();
        _caller_is_owner boolean := private.is_owner(_caller);
        _caller_is_staff boolean := private.is_staff(_caller);
        _target_is_owner boolean := private.is_owner(_target);
BEGIN
  IF _caller IS NULL OR NOT _caller_is_staff THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF (_role = 'owner' OR _target_is_owner) AND NOT _caller_is_owner THEN
    RAISE EXCEPTION 'only an owner can grant or modify the owner role' USING errcode='42501';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target, _role)
  ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_telegram_link_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tg bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.telegram_link_codes SET consumed_at = now()
   WHERE code = upper(_code) AND consumed_at IS NULL AND expires_at > now()
  RETURNING telegram_id INTO _tg;
  IF _tg IS NULL THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role, telegram_id)
       VALUES (_uid, 'user', _tg)
  ON CONFLICT (user_id) DO UPDATE SET telegram_id = excluded.telegram_id, updated_at = now();
  RETURN true;
END;
$$;

-- 6. Drop now-redundant public helper functions (no longer referenced)
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.is_owner(uuid);
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 7. Lock down EXECUTE on remaining public SECURITY DEFINER functions:
--    revoke from PUBLIC and anon; grant only to authenticated (intentional admin RPCs with internal authorization).
REVOKE ALL ON FUNCTION public.list_users_with_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_telegram_id(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_user_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_telegram_link_code(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_telegram_id(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_telegram_link_code(text) TO authenticated;
