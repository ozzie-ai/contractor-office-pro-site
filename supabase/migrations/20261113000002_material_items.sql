-- Bill of materials per estimate (AI draft, contractor-edited). Same conventions as the Phase 0 schema:
-- org_id + RLS, client-stamped updated_at with the LWW guard, server_updated_at cursor, soft deletes only.
create table public.material_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  estimate_id       uuid not null references public.estimates(id),
  position          integer not null default 0,
  name_en           text not null,
  name_es           text not null default '',
  category          text not null default 'other',
  qty               numeric(12,3) not null default 0,     -- 0 = quantity unknown
  unit              text not null default 'each',
  specifications    text,                                 -- one per line
  search_query      text not null default '',
  evidence          text not null default 'inferred' check (evidence in ('stated','inferred','manual')),
  note              text,
  purchased         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create trigger material_items_lww before update on public.material_items
  for each row execute function public.tg_lww_guard();
create trigger material_items_keys before update on public.material_items
  for each row execute function public.tg_immutable_keys();
create trigger zz_material_items_server_ts before insert or update on public.material_items
  for each row execute function public.tg_set_server_updated_at();
create index material_items_sync_idx on public.material_items (org_id, server_updated_at);
create index material_items_estimate_idx on public.material_items (estimate_id);

alter table public.material_items enable row level security;
create policy material_items_select on public.material_items for select using (public.is_org_member(org_id));
create policy material_items_insert on public.material_items for insert with check (public.is_org_member(org_id));
create policy material_items_update on public.material_items for update
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
-- No DELETE policy: soft delete only.
