-- Truck stock (leftover materials) and the tool inventory. Same conventions as the Phase 0 schema:
-- org_id + RLS, client-stamped updated_at with the LWW guard, server_updated_at cursor, soft deletes only.
-- Tool photos stay on the device (like media.local_file_name); only the tool's text fields sync.

create table public.stock_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id),
  name_en             text not null,
  name_es             text not null default '',
  category            text not null default 'other',
  qty                 numeric(12,3) not null default 0 check (qty >= 0),
  unit                text not null default 'each',
  specifications      text,
  search_query        text not null default '',
  source_estimate_id  uuid references public.estimates(id),   -- the job it was left over from
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  server_updated_at   timestamptz not null default now(),
  deleted_at          timestamptz
);

create table public.tools (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  name_en           text not null,
  name_es           text not null default '',
  category          text not null default 'other',
  brand             text,
  model             text,
  serial_number     text,
  holder            text,          -- who has it / where it is ("Me", "Carlos", "Ana's job")
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['stock_items', 'tools'] loop
    execute format('create trigger %1$s_lww before update on public.%1$s for each row execute function public.tg_lww_guard()', t);
    execute format('create trigger %1$s_keys before update on public.%1$s for each row execute function public.tg_immutable_keys()', t);
    execute format('create trigger zz_%1$s_server_ts before insert or update on public.%1$s for each row execute function public.tg_set_server_updated_at()', t);
    execute format('create index %1$s_sync_idx on public.%1$s (org_id, server_updated_at)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_org_member(org_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_org_member(org_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
    -- No DELETE policy: soft delete only.
  end loop;
end $$;
