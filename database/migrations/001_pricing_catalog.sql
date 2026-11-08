-- Contractor Office Pro owned pricing library, revision 1.
-- Apply in a project controlled by the business owner, not from the mobile client.
-- Do not import unlicensed Gordian Construction Task Catalog records.
create extension if not exists pgcrypto;

create table if not exists public.price_sources (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 source_url text,
 publisher text,
 license_name text not null default 'owner_created',
 commercial_reuse_allowed boolean not null default false,
 attribution text,
 terms_checked_on date,
 notes text,
 created_at timestamptz not null default now()
);

create table if not exists public.trade_tasks (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 trade text not null check(trade in ('electrical','plumbing','painting','concrete','handyman','remodel','cleaning')),
 title_en text not null,
 title_es text not null,
 scope_en text,
 scope_es text,
 unit text not null check(unit in ('each','job','sq ft','linear ft','cu yd','hr','day')),
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now()
);

create table if not exists public.price_regions (
 id uuid primary key default gen_random_uuid(),
 region_code text not null unique,
 country_code char(2) not null default 'US',
 state_code text not null,
 region_name text not null,
 city text,
 postal_prefix text,
 locality_type text not null default 'metro' check(locality_type in ('state','metro','county','city','postal')),
 parent_region_id uuid references public.price_regions(id),
 created_at timestamptz not null default now()
);

create table if not exists public.unit_cost_observations (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.trade_tasks(id),
 region_id uuid not null references public.price_regions(id),
 source_id uuid not null references public.price_sources(id),
 observed_on date not null,
 expires_on date,
 currency char(3) not null default 'USD',
 labor_hours_per_unit numeric(12,4) check(labor_hours_per_unit>=0),
 labor_wage_per_hour numeric(12,4) check(labor_wage_per_hour>=0),
 labor_burden_factor numeric(8,4) check(labor_burden_factor>=1),
 material_cost_per_unit numeric(12,4) check(material_cost_per_unit>=0),
 equipment_cost_per_unit numeric(12,4) check(equipment_cost_per_unit>=0),
 other_cost_per_unit numeric(12,4) check(other_cost_per_unit>=0),
 observed_unit_bid numeric(12,4) check(observed_unit_bid>=0),
 sample_size integer check(sample_size>0),
 verified boolean not null default false,
 confidence text not null default 'unverified' check(confidence in ('unverified','low','medium','high')),
 source_record_id text,
 provenance_note text,
 created_at timestamptz not null default now(),
 constraint price_has_basis check (
  labor_hours_per_unit is not null or material_cost_per_unit is not null
  or equipment_cost_per_unit is not null or other_cost_per_unit is not null
  or observed_unit_bid is not null
 )
);
create index if not exists idx_cost_task_region_date on public.unit_cost_observations(task_id, region_id, observed_on desc);

-- Contractor-specific selling prices are separate from anonymized reference costs.
create table if not exists public.contractor_price_overrides (
 id uuid primary key default gen_random_uuid(),
 contractor_id uuid not null,
 task_id uuid not null references public.trade_tasks(id),
 region_id uuid references public.price_regions(id),
 custom_rate numeric(12,4) not null check(custom_rate>=0),
 effective_on date not null default current_date,
 notes text,
 created_at timestamptz not null default now(),
 unique(contractor_id,task_id,region_id,effective_on)
);
create index if not exists idx_override_contractor on public.contractor_price_overrides(contractor_id);

-- Wage benchmarks are occupations, NOT finished installed-unit prices.
create table if not exists public.occupation_wages (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.price_sources(id),
 region_id uuid not null references public.price_regions(id),
 occupation_code text not null,
 occupation_title text not null,
 wage_year integer not null,
 hourly_mean numeric(12,4) not null check(hourly_mean>=0),
 observed_on date not null,
 source_record_id text,
 created_at timestamptz not null default now(),
 unique(source_id,region_id,occupation_code,wage_year)
);

-- Public users cannot write or read internal pricing tables directly;
-- expose through a vetted server endpoint with explicit authorization.
alter table public.price_sources enable row level security;
alter table public.trade_tasks enable row level security;
alter table public.price_regions enable row level security;
alter table public.unit_cost_observations enable row level security;
alter table public.contractor_price_overrides enable row level security;
alter table public.occupation_wages enable row level security;
-- No anonymous/authenticated policies: deny by default.
-- A service-role backend may read/write after enforcing tenant ownership.
