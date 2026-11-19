-- Mirror of verified development-project security-hardening migration.
-- RLS helpers are only callable for authenticated roles, not anon.
alter function public.tg_set_server_updated_at() set search_path = pg_catalog, public, pg_temp;
alter function public.tg_lww_guard() set search_path = pg_catalog, public, pg_temp;
alter function public.tg_immutable_keys() set search_path = pg_catalog, public, pg_temp;
alter function public.tg_jobs_default_assignee() set search_path = pg_catalog, public, pg_temp;
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.owner_member_id(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.owner_member_id(uuid) to authenticated;
alter function public.is_org_member(uuid) set search_path = pg_catalog, public, pg_temp;
alter function public.is_org_admin(uuid) set search_path = pg_catalog, public, pg_temp;
alter function public.owner_member_id(uuid) set search_path = pg_catalog, public, pg_temp;
alter function public.create_org_for_user(uuid,uuid,text,text,text)
  set search_path = pg_catalog, public, pg_temp;
