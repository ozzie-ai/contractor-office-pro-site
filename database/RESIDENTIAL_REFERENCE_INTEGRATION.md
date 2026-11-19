# Residential pricing research: integrated without false selling-price approvals

**As of 2026-11-16:** Imported the owner's private SQLite master research data into **Supabase development** at project `xhbbshryjdcotvwuslxd`, separate from contractor-owned `price_book_items`. These are preliminary references for research/contractor budgeting, NOT trusted retail or finished customer quotes.

## Verified live development catalog

- **1,674 total research records** in `public.cop_research_references`:
  - 4 reviewed preliminary-budget ranges from `cop_budget_benchmarks` (no independent contractor field sign-off).
  - 1,244 service-market references (513 flagged budget-usable with the original limitations).
  - 426 supplier/equipment references, all reference-only.
- 731 other service references are reference-only and cannot be used as budget-rate defaults.
- Original `cop_service_pricebook` had 1,245 rows, but one record had an empty service name and was intentionally excluded. All 426 supplier rows were retained. Records with missing/invalid prices are retained **without a price**, not auto-approved.
- Last original master review: `approved_unit_rates` **0**; `cop_usage_decisions` **106,636** decision/provenance records are retained in the original SQLite, not bulk-exposed to the application. Never infer these are approved selling rates.
- Database check verified **all `automatic_final_quote = false`**. An authenticated *business member* can SELECT references; anonymous callers cannot and authenticated app users cannot INSERT/UPDATE/DELETE. The seller's private `public.price_book_items` remains a separate org-scoped table.

## How existing work connects

- The current unified branch includes both `mobile/` (Expo, cross-platform client) and `ios/` (Derek's preserved native Swift client), plus shared `backend/` and SQL migrations.
- Added `GET /v1/research-references?budget_only=true&limit=50` on FastAPI with authenticated verified business membership. Returned records are typed and rejected if a record claims automatic final quote.
- Added optional **View preliminary residential references** in Expo Step 3 (Review prices). It displays scope, exclusions, locality and range **read only**. It does not set line prices or change PDFs.
- The native Swift project still needs the equivalent read-only reference UI/API method; it has NOT been built or merged into Expo's runtime.
- Live Render Free remains on older backend commit `173238e` until its owner **manually deploys the latest integration commit**. Repo/CI changes are not running on Render or installed on the iPhone until deployed/pulled. OpenAI API billing is not enabled.

## Refresh workflow

Export from the original SQLite file using read-only source access:

```sh
python3 database/export_research_staging.py \
 --db /path/to/Contractor_Office_Pro_Residential_Data.sqlite \
 --out-dir ./pricing-review-import
```

The resulting `cop_research_batch_XX.sql` files only insert research references using stable IDs and `ON CONFLICT DO NOTHING`; no client data, private provider keys or final selling-price approvals are included. The original file is never modified. The source SQL import batches and audit manifest for this development import are stored in the user's **private ChatGPT Library folder `/Contractor Office Pro Research`**, not in the public GitHub repository.

**Approval gate:** Only a separate explicit per-task contractor process should promote an independently priced scope to a private contractor selling-rate row. Never copy `cop_research_references.planning_rate_usd` into customer PDFs or `price_book_items.unit_price` automatically.

## Next verification gates

1. Manual Render redeploy from PR #46, then use authenticated session to verify `/v1/account/status`, `/v1/research-references` and `/v1/estimate/price`.
2. Test the current Xcode/Expo iPhone application with the newest branch, preserving local jobs and photos; validate the new read-only reference panel.
3. Confirm real Supabase signup/email OTP template and organization membership; then test signed-in access and RLS isolation.
4. Port/reuse the best verified Swift capture/offline sync capabilities cross-platform without deleting Expo local data.
5. Validate more full scope/price tasks across trades with real supplier observations and contractor approvals; the research table is **not** a complete accurate selling pricebook.
