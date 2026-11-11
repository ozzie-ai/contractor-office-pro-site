# Contractor Office Pro — verified job cost model (original app)

## Core rule
For each job: identify confirmed work and quantities, verify material purchase costs, calculate actual labor time for the **whole visit**, allow purchasing/travel **once per job**, then apply overhead and profit. A retail price is not automatically a contractor selling price. The customer's proposal never includes the private transcript.

## Supported, today
- Keep the original web app's voice dictation, trade selection, Spanish/English switch, editable rows and proposal workflow. No separate workspace.
- A small, expandable one-visit cost form appears for recognized **replacement outlet** requests. It detects total count in Spanish or English, asks to confirm uncertain GFCI speech, never treats 5 replacements as 5 replacements plus 5 additional new installations, and requires material source and total labor hours.
- Each material price can be checked via direct Home Depot or Lowe's search links; the contractor enters the actual unit price and confirms it. **No live API is currently connected.** Product choice, store context and checked price remain the contractor's responsibility.
- Calculation uses verified material cost, paid labor hours × loaded hourly cost, one travel/purchasing charge, supplies/plates, and editable original-app overhead/profit fields.
- For other trades, material rows receive retailer-research links and must be confirmed with a retailer or actual invoice before a customer proposal. An optional collapsed section can replace the separately labeled labor entries with one whole-job labor cost and travel charge. Combined task prices still need contractor review to avoid double-counting.
- This is a **pilot** for the costing architecture; not every trade's materials are identified exhaustively and real supplier price retrieval is not automated.

## Constraints before live retailer lookups
Home Depot has no generally documented public shopper price API. Lowe's developer catalog API requires approved partner credentials, and is not an open consumer API. The static GitHub Pages site cannot securely host retailer authorization tokens. Genuine automatic lookup needs an authorized product-price provider, an authenticated server endpoint, location-aware product/SKU matching, validation of unit size/pack, freshness and a sensible fallback if nothing matches.

Do not scrape websites inside the browser and label guesses as current prices. Do not commit secret keys to this repo.

## Illustrative validation (not current prices)
3 regular outlets × $3.68 plus 2 GFCIs × $18.98 = $49 materials.
2.5 hours × $90 = $225 labor; $45 purchasing/travel once; $10 minor supplies.
Direct cost = $329; overhead 10% = $32.90; profit on cost plus overhead 20% = $72.38; price = $434.28.
All figures are scenario inputs, not a live Home Depot/Lowe's quote or a recommended market rate.

## Checks
`node tests/job-pricing.test.mjs`
`node tests/pricing-browser.test.mjs` (requires headless Chrome)
`node tests/run-tests.mjs`
`node tests/level2-api.test.mjs`

Next work: proper SKU-level pricing catalog, supplier API once authorized, sourcing by ZIP/store, material tax or delivery rules, crew labor production coefficients, and universal trade-to-assembly integration while preserving the original short voice-first interface.
