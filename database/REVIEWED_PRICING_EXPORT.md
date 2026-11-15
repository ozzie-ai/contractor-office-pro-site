# Master residential SQLite → reviewed rate staging

This is a **read-only safety-gated export** of the user's local master pricing
database. It is not a remote database, approved supplier feed or instant ratebook.

From the repository root:

```bash
python3 database/export_reviewed_pricing.py \
  --db "$HOME/ContractorOfficeProData/Contractor_Office_Pro_Residential_Data.sqlite" \
  --out "$HOME/ContractorOfficeProData/reviewed-pricing-stage.json"
```

Change the `--db` path to where the real master SQLite lives; do not assume it is
on the GitHub server. The script reads the source with SQLite `mode=ro` and
exports only records from `approved_unit_rates` with positive rate, valid
evidence, reviewer and approval date; plus explicitly `approved_for_preliminary_budget`
records from `cop_budget_benchmarks`. Preliminary budget ranges are **never**
converted into customer selling rates.

The November 10 master database inspection found **zero** rows in
`approved_unit_rates` and **four** benchmarks with
`approved_for_preliminary_budget` status (one other benchmark needs refresh).
These are not a finished residential selling-price catalogue. No other source
tables, client data, unvalidated regional adjustments or market citations are
automatically copied to Supabase. Require scope, locality, units, current costs,
contractor review and explicit release approval before cloud pricebook import.

Run `python3 -m unittest discover -s database/tests` to verify the fail-closed
release gate without using real private data. The JSON export is an offline
review artifact; any actual Supabase insertion requires a separate audited
migration and authenticated business account. Do **not** commit the master DB
or output file.
