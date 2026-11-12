# Contractor Office Pro — Simple offline reference pricebook

## Product principle
**Contractor says what the job is. The application remembers broad commodity material prices. The contractor never needs to know a store SKU.** Keep the original English/Spanish microphone workflow, original estimate table and customer proposal.

## What exists in this first backend iteration
`core/reference-pricebook.js` holds dated, source-backed **generic material families**, each with two or three retailer price examples or variants. No API calls are made while generating a material estimate. Data can be used when the JavaScript files have already loaded, even without internet access. The website and browser speech recognition themselves are **not guaranteed to work offline** without a separate installed offline app / service worker and offline speech engine.

The first eight families span electrical, drywall, concrete, painting and plumbing:
- 15A residential outlet, including typical and commercial grades
- 15A GFCI outlet
- 14/2 copper NM-B indoor cable, 100-foot roll
- 1/2-inch 4x8 standard drywall sheet
- 20-minute, 18-pound setting compound
- 80-pound bagged general-purpose concrete
- One gallon of interior wall paint
- 4-inch centerset chrome bathroom faucet

All examples are reference prices observed November 11, 2026 (not live). Actual local checkout prices, tax, promotions and pack quantities may vary. Source links are preserved in the database for research/maintenance, not used for SKU matching in the contractor interface.

## Estimating logic
- Convert spoken quantities and specification words into materials and purchasable units.
- Outlets: five existing outlets replaced are **five total**, not five replacements plus five additional new installations. GFCI quantities are subsets; uncertain speech is confirmed.
- Wire: 100 feet of 14/2 NM-B uses one 100-foot roll at the stored reference, with warning to confirm slack/waste. Several circuits of ambiguous length require confirmation.
- Drywall: sheets are counted individually, or area/32 rounded up; a cutting-waste question is retained. Setting compound is priced only when its bag count is known.
- Concrete: 80lb bag price applies only when bagged mix is specified; **not** automatically substituted for truck-delivered ready-mix.
- Paint: flat interior and eggshell interior are different reference variants.
- Plumbing: 4in centerset faucet references do not apply to kitchen faucets, 8in widespread fixtures, or customer-supplied fixtures.

`core/pricebook-bridge.js` connects this data to the existing estimator without introducing another screen. The outlet panel's material unit costs autofill from cached prices. If the original estimate contains no material budget, unambiguous materials can be inserted as itemized lines; missing labor remains pending rather than invented. Existing combined material/labor rows are **not** automatically duplicated. The room-painting unit cost can be replaced from a reference only if its original example default has not been manually edited.

## Costs and honest status
- Retail reference cost is not a customer selling price.
- Job totals still require verified labor hours/rates, purchasing/travel costs, consumables, overhead and profit.
- Unknown or ambiguous materials should remain unpriced, not be silently substituted.
- If cached reference price observations are older than 45 days, the app flags them for review.
- This initial library is intentionally limited; it must be expanded by trade and operation while preserving the same interface.
- Future work: routine audited catalog price refreshing, task assemblies, saved contractor crew cost/production defaults, an offline-first installable app, and advanced blueprint/material takeoffs. No secret retailer keys in GitHub Pages.

## Test
Run:
`node tests/reference-pricebook.test.mjs`
`node tests/reference-pricebook-browser.test.mjs` (headless Chrome required)
`node tests/job-pricing.test.mjs`
`node tests/pricing-browser.test.mjs`
`node tests/run-tests.mjs`
`node tests/level2-api.test.mjs`

## Real-world example scripts
1. **Electrical:** "Reemplaza cinco outlets viejos, dos son GFCI, yo pongo los materiales." Expected: 3 standard + 2 GFCI, zero extra new circuits; labor/trip needed for final quote.
2. **Cable:** "Instala 100 pies de cable Romex 14/2 NM-B." Expected: one 100ft roll, with slack/waste review; job labor pending.
3. **Drywall:** "Instala diez hojas de drywall de media pulgada, cuatro por ocho, y dos sacos de compuesto de 20 minutos." Expected: 10 boards + 2 bags, with labor and accessory review.
4. **Plumbing:** "Replace two 4-inch centerset chrome bathroom faucets." Expected: 2 faucets only; labor pending.
5. **Paint:** "Pintar paredes interiores con dos galones de pintura eggshell." Expected: eligible cached paint cost per gallon, still subject to actual measured coverage and job labor.
6. **Concrete:** "Colocar cinco sacos de concreto preparado de 80 libras." Expected: five 80lb bags; not a ready-mix price.

These are small **regression fixtures**, not the only jobs or trades the eventual application should support.
