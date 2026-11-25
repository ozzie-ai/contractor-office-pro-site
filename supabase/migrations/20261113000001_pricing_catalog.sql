-- ContractorOfficePro · Pricing catalog (merges the team's database/migrations/001_pricing_catalog.sql)
-- Reference tables are global (no org_id): readable by signed-in users, writable only by the server (service key).
-- Contractor-specific prices stay in the org-scoped, synced price_book_items table (new task_code column).
-- No invented prices: the only seeded observations are the team pilot's labeled LA planning allowances.

create table public.price_sources (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null unique,
  source_url               text,
  publisher                text,
  license_name             text not null default 'owner_created',
  commercial_reuse_allowed boolean not null default false,
  attribution              text,
  terms_checked_on         date,
  notes                    text,
  created_at               timestamptz not null default now()
);

create table public.trade_tasks (
  code        text primary key,
  trade       text not null check (trade in ('electrical','plumbing','painting','concrete','handyman','remodel','cleaning','other')),
  title_en    text not null,
  title_es    text not null,
  unit        text not null,
  guidance    text not null default '',
  status      text not null default 'active' check (status in ('active','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.price_regions (
  region_code        text primary key,
  country_code       char(2) not null default 'US',
  state_code         text not null,
  region_name        text not null,
  city               text,
  locality_type      text not null default 'metro' check (locality_type in ('state','metro','county','city','postal')),
  parent_region_code text references public.price_regions(region_code),
  created_at         timestamptz not null default now()
);

create table public.unit_cost_observations (
  id                      uuid primary key default gen_random_uuid(),
  task_code               text not null references public.trade_tasks(code),
  region_code             text not null references public.price_regions(region_code),
  source_id               uuid not null references public.price_sources(id),
  observed_on             date not null,
  expires_on              date,
  currency                char(3) not null default 'USD',
  labor_hours_per_unit    numeric(12,4) check (labor_hours_per_unit >= 0),
  labor_wage_per_hour     numeric(12,4) check (labor_wage_per_hour >= 0),
  labor_burden_factor     numeric(8,4)  check (labor_burden_factor >= 1),
  material_cost_per_unit  numeric(12,4) check (material_cost_per_unit >= 0),
  equipment_cost_per_unit numeric(12,4) check (equipment_cost_per_unit >= 0),
  other_cost_per_unit     numeric(12,4) check (other_cost_per_unit >= 0),
  -- A finished per-unit price someone charged/quoted. Usually already includes overhead and profit.
  observed_unit_bid       numeric(12,4) check (observed_unit_bid >= 0),
  bid_includes_markup     boolean not null default true,
  sample_size             integer check (sample_size > 0),
  verified                boolean not null default false,
  confidence              text not null default 'unverified' check (confidence in ('unverified','low','medium','high')),
  applies_to              text,            -- e.g. '100A two-pole breaker'; shown with the price
  provenance_note         text,
  created_at              timestamptz not null default now(),
  constraint observation_has_basis check (
    labor_hours_per_unit is not null or material_cost_per_unit is not null
    or equipment_cost_per_unit is not null or other_cost_per_unit is not null or observed_unit_bid is not null)
);
create index unit_cost_obs_lookup on public.unit_cost_observations (task_code, region_code, observed_on desc);

-- Read-only reference data for signed-in users; writes only through the server.
do $$
declare t text;
begin
  foreach t in array array['price_sources','trade_tasks','price_regions','unit_cost_observations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Business pricing settings.
alter table public.organizations
  add column region_code  text,
  add column overhead_pct numeric(6,4) not null default 0.10 check (overhead_pct >= 0 and overhead_pct <= 1),
  add column profit_pct   numeric(6,4) not null default 0.10 check (profit_pct >= 0 and profit_pct <= 1);

-- Contractor prices: a price book row can stand for a catalog task (its unit_price is the contractor's selling price).
alter table public.price_book_items add column task_code text references public.trade_tasks(code);
create index price_book_task_idx on public.price_book_items (org_id, task_code) where deleted_at is null;

-- Estimate/line metadata from the AI + pricing steps.
alter table public.estimates
  add column internal_notes text,   -- private: dictation/transcript, never on customer documents
  add column exclusions     text,   -- customer-facing, one per line
  add column open_questions text;   -- private: what the AI couldn't determine
alter table public.line_items
  add column task_code    text references public.trade_tasks(code),
  add column price_source text not null default 'manual'
    check (price_source in ('contractor','reference','manual','none')),
  add column price_note   text,     -- where the number came from, shown to the contractor
  add column preliminary  boolean not null default false;

-- Seed: regions and sources from the team's seed (database/seed/001_original_tasks.sql).
insert into public.price_regions (region_code, state_code, region_name, city, locality_type, parent_region_code) values
  ('US-CA', 'CA', 'California statewide', null, 'state', null),
  ('US-ID', 'ID', 'Idaho statewide', null, 'state', null),
  ('US-CA-LA', 'CA', 'Los Angeles metropolitan area', null, 'metro', 'US-CA'),
  ('US-CA-SANTA-MONICA', 'CA', 'Santa Monica', 'Santa Monica', 'city', 'US-CA-LA'),
  ('US-CA-BEVERLY-HILLS', 'CA', 'Beverly Hills', 'Beverly Hills', 'city', 'US-CA-LA'),
  ('US-CA-SANTA-CLARITA', 'CA', 'Santa Clarita', 'Santa Clarita', 'city', 'US-CA-LA')
on conflict (region_code) do nothing;

update public.organizations set region_code = 'US-CA-LA' where region_code is null;
alter table public.organizations
  alter column region_code set default 'US-CA-LA',
  add constraint organizations_region_fk foreign key (region_code) references public.price_regions(region_code);

insert into public.price_sources (name, source_url, publisher, license_name, commercial_reuse_allowed, attribution, terms_checked_on, notes) values
  ('California EDD OEWS', 'https://publish.data.ca.gov/dataset/oews', 'California Employment Development Department',
   'CC BY', true, 'California Employment Development Department — Occupational Employment and Wage Statistics',
   date '2026-11-08', 'Employee wage benchmarks; not installed-work unit rates.'),
  ('Contractor Office Pro Internal', 'https://github.com/ozzie-ai/contractor-office-pro-site', 'Contractor Office Pro',
   'owner_created', true, 'Contractor Office Pro', date '2026-11-08', 'Contractor-entered verified prices, hours and production rates.'),
  ('Pilot LA planning allowance (illustrative)', 'https://github.com/ozzie-ai/contractor-office-pro-site/blob/main/mobile/src/preliminaryPricing.ts',
   'Contractor Office Pro team pilot', 'owner_created', true, 'Contractor Office Pro team',
   date '2026-11-13', 'Illustrative LA 2026 planning allocations from the team pilot. Not quotes or verified costs. '
   'Public LA ranges for complete 100A→200A upgrades: ~$2,500–4,500+ (ceonelectric.com, amyelectric.com).')
on conflict (name) do nothing;

insert into public.trade_tasks (code, trade, title_en, title_es, unit, guidance) values
  ('ELEC.PANEL.UPGRADE', 'electrical', 'Electrical panel / service upgrade', 'Actualización de panel / servicio eléctrico', 'job', 'Replacing the main panel/service. Put old and new amperage in specifications.'),
  ('ELEC.CIRCUIT.TRANSFER', 'electrical', 'Transfer existing branch circuit to new panel', 'Transferir circuito existente a panel nuevo', 'each', 'Existing circuits moved/reconnected to a new panel, including onto new breakers. Quantity = number of existing circuits.'),
  ('ELEC.CIRCUIT.NEW', 'electrical', 'New branch circuit (breaker + wiring)', 'Circuito nuevo (breaker y cableado)', 'each', 'A new circuit INCLUDES its breaker; do not also list ELEC.BREAKER.ONLY for it.'),
  ('ELEC.WIRE.RUN', 'electrical', 'Wire run', 'Tendido de cable', 'linear ft', 'Length of cable/conduit run for a circuit, in feet.'),
  ('ELEC.EV.CHARGER.INSTALL', 'electrical', 'Install EV charger', 'Instalar cargador de vehículo eléctrico', 'each', 'Mounting and connecting the charging unit. Charger current is not the breaker rating.'),
  ('ELEC.BREAKER.ONLY', 'electrical', 'Install breaker only (no new wiring)', 'Instalar únicamente breaker (sin cableado nuevo)', 'each', 'Breaker installed now with no circuit, e.g. reserved for future work.'),
  ('ELEC.BREAKER.REPLACE', 'electrical', 'Replace damaged breaker', 'Reemplazar breaker dañado', 'each', ''),
  ('ELEC.GFCI', 'electrical', 'Install GFCI receptacle', 'Instalar tomacorriente GFCI', 'each', ''),
  ('ELEC.RECESSED.LIGHT', 'electrical', 'Install recessed ceiling light', 'Instalar luz empotrada de techo', 'each', ''),
  ('ELEC.PERMIT', 'electrical', 'Electrical permit allowance', 'Permiso eléctrico', 'job', ''),
  ('PLUMB.FAUCET.REPLACE', 'plumbing', 'Replace existing faucet', 'Reemplazar grifo existente', 'each', ''),
  ('PAINT.INTERIOR.SF', 'painting', 'Interior painting', 'Pintura interior', 'sq ft', ''),
  ('CONCRETE.SLAB.CY', 'concrete', 'Place concrete slab', 'Colocar losa de concreto', 'cu yd', ''),
  ('HANDY.GENERAL.HR', 'handyman', 'General handyman labor', 'Trabajos varios por hora', 'hr', ''),
  ('REMODEL.BATH.JOB', 'remodel', 'Bathroom renovation scope review', 'Revisión de remodelación de baño', 'job', 'Use only as a placeholder; prefer listing individual tasks.'),
  ('CLEAN.RESIDENTIAL.SF', 'cleaning', 'Residential cleaning area', 'Área de limpieza residencial', 'sq ft', '')
on conflict (code) do update set trade = excluded.trade, title_en = excluded.title_en, title_es = excluded.title_es,
  unit = excluded.unit, guidance = excluded.guidance, updated_at = now();

-- The team pilot's three allowances, labeled preliminary (unverified, low confidence, bid already includes markup).
insert into public.unit_cost_observations
  (task_code, region_code, source_id, observed_on, expires_on, observed_unit_bid, bid_includes_markup, verified, confidence, applies_to, provenance_note)
select v.task_code, 'US-CA-LA', s.id, date '2026-11-12', date '2027-11-12', v.bid, true, false, 'low', v.applies_to, v.note
from public.price_sources s,
  (values
    ('ELEC.PANEL.UPGRADE', 2100.00, '200A panel equipment + installation (excludes circuit transfers and permit)',
     'Pilot allocation for a 200A panel component; complete LA upgrades commonly run ~$2,500–4,500+.'),
    ('ELEC.CIRCUIT.TRANSFER', 35.00, 'Per existing circuit moved to the new panel',
     'Pilot allocation per transferred circuit.'),
    ('ELEC.BREAKER.ONLY', 220.00, '100A two-pole breaker, no wiring',
     'Pilot allocation for a 100A breaker-only install; other sizes differ.')
  ) as v(task_code, bid, applies_to, note)
where s.name = 'Pilot LA planning allowance (illustrative)';
