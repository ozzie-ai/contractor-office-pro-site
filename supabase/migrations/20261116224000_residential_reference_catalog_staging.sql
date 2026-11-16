-- One global research-only catalog; tenant-owned final rates remain separately
-- in public.price_book_items. This data must never be an automatic customer quote.
CREATE TABLE IF NOT EXISTS public.cop_research_references (
  reference_id text PRIMARY KEY,
  reference_kind text NOT NULL CHECK (reference_kind IN ('reviewed_budget','service_market','supplier_market')),
  trade text NOT NULL CHECK (length(trim(trade)) > 0),
  service text NOT NULL CHECK (length(trim(service)) > 0),
  unit text NOT NULL,
  locality text NOT NULL DEFAULT '',
  low_usd numeric(12,2) CHECK (low_usd IS NULL OR low_usd >= 0),
  high_usd numeric(12,2) CHECK (high_usd IS NULL OR high_usd >= 0),
  planning_rate_usd numeric(12,2) CHECK (planning_rate_usd IS NULL OR planning_rate_usd >= 0),
  cost_basis text,
  scope text,
  exclusions text,
  evidence_note text,
  checked_on date,
  recheck_on date,
  review_status text NOT NULL CHECK (review_status IN
    ('reviewed_preliminary_budget','market_reference','needs_source_refresh','reference_only')),
  budget_usable boolean NOT NULL DEFAULT false,
  automatic_final_quote boolean NOT NULL DEFAULT false CHECK (automatic_final_quote = false),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_order CHECK (low_usd IS NULL OR high_usd IS NULL OR low_usd <= high_usd),
  CONSTRAINT reviewed_budget_gate CHECK (
    review_status != 'reviewed_preliminary_budget' OR
    (reference_kind = 'reviewed_budget' AND budget_usable = true)
  )
);
CREATE INDEX IF NOT EXISTS cop_research_refs_trade_idx
  ON public.cop_research_references (lower(trade), budget_usable);
CREATE INDEX IF NOT EXISTS cop_research_refs_locality_idx
  ON public.cop_research_references (lower(locality));
ALTER TABLE public.cop_research_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cop_research_refs_signed_in_read ON public.cop_research_references;
CREATE POLICY cop_research_refs_signed_in_read ON public.cop_research_references
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON TABLE public.cop_research_references FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cop_research_references TO authenticated;
COMMENT ON TABLE public.cop_research_references IS
  'Reference-only preliminary market catalog; no rows may be automatic final customer selling prices.';