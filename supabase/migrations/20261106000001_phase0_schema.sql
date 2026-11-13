-- ContractorOfficePro · Phase 0 schema
-- Conventions (see docs/decisions/0001-offline-sync-lww.md):
--   * id uuid is generated on the device (offline creation); default only as a fallback.
--   * org_id on every table; RLS scopes all access by org membership.
--   * updated_at is set by the CLIENT at edit time and drives last-write-wins.
--   * server_updated_at is set by the SERVER on every write and is the pull cursor.
--   * deleted_at = soft delete. There are no DELETE policies, so hard deletes are impossible via the API.
--   * Money is numeric(12,2); quantities numeric(12,3). Totals are computed by app code, stored as a cache.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Stamp the server cursor on every insert/update.
create or replace function public.tg_set_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

-- Last-write-wins guard: silently keep the existing row if the incoming client
-- timestamp is older. Returning NULL from a BEFORE trigger skips the update.
create or replace function public.tg_lww_guard()
returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;

-- org_id and id must never change once written.
create or replace function public.tg_immutable_keys()
returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.org_id <> old.org_id then
    raise exception 'id and org_id are immutable';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Organizations & members
-- ---------------------------------------------------------------------------

create table public.organizations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,              -- equals id; kept so every table has org_id
  name              text not null,
  cslb_license      text,                       -- required on CA contracts (Phase 1)
  address           text,
  phone             text,
  email             text,
  default_language  text not null default 'en' check (default_language in ('en','es')),
  tax_rate          numeric(6,4) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint organizations_org_is_self check (org_id = id)
);

create table public.members (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  user_id           uuid references auth.users(id),   -- null for future invited-but-not-joined crew
  display_name      text not null,
  role              text not null default 'owner' check (role in ('owner','admin','crew')),
  phone             text,
  preferred_language text not null default 'en' check (preferred_language in ('en','es')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index members_org_user_uq on public.members(org_id, user_id) where user_id is not null;
create index members_user_idx on public.members(user_id);

-- Membership check used by every RLS policy. SECURITY DEFINER avoids RLS recursion on members.
create or replace function public.is_org_member(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where org_id = o and user_id = auth.uid() and deleted_at is null
  );
$$;

-- Owner member id for the caller's org; used as the assigned_to default.
create or replace function public.owner_member_id(o uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where org_id = o and role = 'owner' and deleted_at is null
  order by created_at limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Clients, jobs, time
-- ---------------------------------------------------------------------------

create table public.clients (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id),
  name               text not null,
  phone              text,
  email              text,
  address            text,
  preferred_language text not null default 'en' check (preferred_language in ('en','es')),
  sms_consent        text not null default 'unknown' check (sms_consent in ('unknown','granted','revoked')),
  sms_consent_at     timestamptz,
  is_senior_65_plus  boolean not null default false,   -- CA: 5-day right to cancel (Phase 1)
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  server_updated_at  timestamptz not null default now(),
  deleted_at         timestamptz
);

create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  client_id         uuid references public.clients(id),
  title             text not null,
  address           text,
  status            text not null default 'lead'
                      check (status in ('lead','estimating','scheduled','in_progress','completed','cancelled')),
  assigned_to       uuid references public.members(id),
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  job_id            uuid not null references public.jobs(id),
  member_id         uuid references public.members(id),
  clock_in          timestamptz not null,
  clock_out         timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint time_entries_order check (clock_out is null or clock_out >= clock_in)
);

-- ---------------------------------------------------------------------------
-- Price book, estimates, line items
-- ---------------------------------------------------------------------------

create table public.price_book_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  kind              text not null check (kind in ('labor','material','markup','other')),
  name_en           text not null,
  name_es           text,
  unit              text not null default 'ea',
  unit_cost         numeric(12,2) not null default 0,   -- what it costs you
  unit_price        numeric(12,2) not null default 0,   -- what you charge
  markup_pct        numeric(6,3),
  category          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table public.estimates (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  job_id            uuid not null references public.jobs(id),
  number            text,
  status            text not null default 'draft' check (status in ('draft','sent','accepted','declined')),
  language          text not null default 'en' check (language in ('en','es')),
  -- Cached totals, always computed by app code (never by an LLM).
  subtotal          numeric(12,2) not null default 0,
  tax               numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  deposit_amount    numeric(12,2),
  sent_at           timestamptz,
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table public.line_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  estimate_id       uuid not null references public.estimates(id),
  price_book_item_id uuid references public.price_book_items(id),
  position          integer not null default 0,
  description_en    text not null default '',
  description_es    text not null default '',
  qty               numeric(12,3) not null default 1,
  unit              text not null default 'ea',
  unit_price        numeric(12,2) not null default 0,
  taxable           boolean not null default true,
  source            text not null default 'manual' check (source in ('ai','price_book','manual')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- Money out: expenses & receipts
-- ---------------------------------------------------------------------------

create table public.receipts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  job_id            uuid references public.jobs(id),
  store             text,
  purchased_on      date,
  subtotal          numeric(12,2),
  tax               numeric(12,2),
  total             numeric(12,2),
  image_path        text,               -- storage path in the 'media' bucket
  ocr_text          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table public.receipt_line_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  receipt_id        uuid not null references public.receipts(id),
  sku               text,
  description       text not null,
  qty               numeric(12,3) not null default 1,
  unit_price        numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  job_id            uuid references public.jobs(id),
  receipt_id        uuid references public.receipts(id),
  category          text not null default 'materials',
  description       text,
  amount            numeric(12,2) not null,
  spent_on          date not null default current_date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- Media (photos, voice memos)
-- ---------------------------------------------------------------------------

create table public.media (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  job_id            uuid references public.jobs(id),
  kind              text not null check (kind in ('photo','voice')),
  storage_path      text,               -- '{org_id}/{job_id}/{id}.{ext}' once uploaded
  upload_state      text not null default 'pending' check (upload_state in ('pending','uploaded','failed')),
  duration_seconds  numeric(8,2),
  transcript        text,
  transcript_language text check (transcript_language in ('en','es')),
  captured_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- Per-table triggers, indexes, RLS
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','members','clients','jobs','time_entries','price_book_items',
    'estimates','line_items','receipts','receipt_line_items','expenses','media'
  ] loop
    execute format('create trigger %1$s_lww before update on public.%1$I
                    for each row execute function public.tg_lww_guard()', t);
    execute format('create trigger %1$s_keys before update on public.%1$I
                    for each row execute function public.tg_immutable_keys()', t);
    -- "zz_" so it runs after the guard (triggers fire alphabetically).
    execute format('create trigger zz_%1$s_server_ts before insert or update on public.%1$I
                    for each row execute function public.tg_set_server_updated_at()', t);
    execute format('create index %1$s_sync_idx on public.%1$I (org_id, server_updated_at)', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_select on public.%1$I for select
                    using (public.is_org_member(org_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update
                    using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
    -- No DELETE policy: soft delete only.
  end loop;
end $$;

-- INSERT policies. Organizations and members are created only through create_org_for_user().
do $$
declare t text;
begin
  foreach t in array array[
    'clients','jobs','time_entries','price_book_items','estimates',
    'line_items','receipts','receipt_line_items','expenses','media'
  ] loop
    execute format('create policy %1$s_insert on public.%1$I for insert
                    with check (public.is_org_member(org_id))', t);
  end loop;
end $$;

-- Only owners/admins may edit the org or member rows.
-- SECURITY DEFINER so the members policy can check members without RLS recursion.
create or replace function public.is_org_admin(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where org_id = o and user_id = auth.uid() and role in ('owner','admin') and deleted_at is null
  );
$$;

drop policy organizations_update on public.organizations;
create policy organizations_update on public.organizations for update
  using (public.is_org_admin(id)) with check (org_id = id);
drop policy members_update on public.members;
create policy members_update on public.members for update
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Default jobs.assigned_to to the org owner when the client leaves it empty.
create or replace function public.tg_jobs_default_assignee()
returns trigger language plpgsql as $$
begin
  if new.assigned_to is null then
    new.assigned_to := public.owner_member_id(new.org_id);
  end if;
  return new;
end $$;
create trigger jobs_default_assignee before insert on public.jobs
  for each row execute function public.tg_jobs_default_assignee();

create index clients_org_idx on public.clients(org_id) where deleted_at is null;
create index jobs_client_idx on public.jobs(client_id);
create index estimates_job_idx on public.estimates(job_id);
create index line_items_estimate_idx on public.line_items(estimate_id);
create index receipt_line_items_receipt_idx on public.receipt_line_items(receipt_id);
create index media_job_idx on public.media(job_id);
create index time_entries_job_idx on public.time_entries(job_id);

-- ---------------------------------------------------------------------------
-- Org bootstrap: called once after first sign-in. Idempotent per user.
-- The device passes its own UUIDs so the rows match what it already created offline.
-- ---------------------------------------------------------------------------

create or replace function public.create_org_for_user(
  p_org_id uuid, p_member_id uuid, p_org_name text, p_display_name text, p_language text default 'en'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select org_id into existing from public.members
   where user_id = auth.uid() and deleted_at is null limit 1;
  if existing is not null then
    return existing;
  end if;

  insert into public.organizations (id, org_id, name, default_language)
  values (p_org_id, p_org_id, p_org_name, p_language);

  insert into public.members (id, org_id, user_id, display_name, role, preferred_language)
  values (p_member_id, p_org_id, auth.uid(), p_display_name, 'owner', p_language);

  return p_org_id;
end $$;

revoke all on function public.create_org_for_user(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_org_for_user(uuid, uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private 'media' bucket, paths '{org_id}/...'
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy media_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy media_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_org_member(((storage.foldername(name))[1])::uuid));
