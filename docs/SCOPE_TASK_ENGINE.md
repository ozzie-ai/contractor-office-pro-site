# Contractor Office Pro — Trade-Scoped Assembly Engine (Pilot)

## Product rule
Interpret the requested job, propose an ordered list of measurable tasks, and price only tasks that the contractor explicitly offers and the project requires. Do not infer unlimited trades, wall repair, stucco, painting, pet-waste cleanup, or outdoor cleanup from a related activity. Optional tasks must be opted into per job. Tasks explicitly mentioned but not offered must appear as exclusions, not costs.

## Architecture
- `core/assemblies.mjs`: trade labels, business profile, scoped assembly catalog, optional capabilities, quantity rules, trade-filtered discovery, excluded scope, missing quantity prompts.
- `core/estimate-engine.mjs`: shared line-item costs, material takeoff, labor, fees, overhead, profit and draft validation.
- `workspace.html`: mobile-first contractor profile, text and supported browser speech input, task review, local ratebook, material takeoff, and customer proposal.
- `index.html`: legacy estimator remains; links to workspace and hides unrelated tiles when the device already has a profile.
- `tests/assemblies.test.mjs`: profiles, opt-ins, boundaries, quantities, no invented rates, painting, drywall, concrete, cleaning, roofing, plumbing and flooring.
- `tests/workspace-browser.test.mjs`: actual Chrome interactions for cleaning profile, pricing, proposal without private transcript, switching to plumbing, and exclusion of drywall repair.

## Current assemblies
Painting walls; drywall installation/finishing; faucet replacement; small concrete slab; residential interior cleaning; floor tile; localized roof repair; dedicated electrical circuit; main electrical panel replacement.

The trade registry deliberately includes other specialties for later assembly development. A trade appearing in the registry **does not** mean that its price catalog and full workflow are complete. General remodeling requires the business to select the specific trades it actually provides; there is no unrestricted universal assembly.

## Confirmed behavior
1. Business chooses primary and optional additional trades. Only that selection appears in the new estimating workflow.
2. Extra services require explicit profile capability and explicit inclusion on that job.
3. An out-of-scope job step never becomes a priced line; explicitly mentioned outside-trade work is shown as excluded.
4. Source measurements and rates are never silently invented. A missing measured quantity or unit cost blocks a final price.
5. The contractor enters rates per task and can reuse them on this device; these are not live supplier or market rates.
6. Overhead and profit are explicit editable percentages. Contractor approves scope/rates before creating a customer-facing draft.
7. The customer's proposal uses catalog task descriptions and not the private dictated transcript.
8. The task order is a planning estimate, not instructions to perform regulated or hazardous work. Trade design, permits and safety procedures require qualified review.

## Limitations / next priorities
- The profile filters **this device's UI** only; it is not login-based, enforced subscription authorization, or a license verification system.
- Existing `index.html` remains a separate earlier estimator. Its workflows are not fully rewritten to use the new assemblies.
- The small initial assembly catalog is not an exhaustive knowledge base for all trades and all project conditions.
- Natural-language matching uses conservative rules, not a connected general AI semantic planner. Ambiguous jobs ask the contractor to select the assembly.
- Actual regional pricing from the owner's Mac-hosted SQLite database and automated blueprint takeoffs are **not connected** yet.
- Per-task unit costs saved in browser localStorage do not sync between devices. No client accounts or cloud job storage exist.
- A customer proposal remains a preliminary estimate, not a statutory home-improvement contract.
- Pricing for materials with variants (such as breakers, different roof types, drywall boards) requires detailed catalog entries and verification; no generic item should be represented as an exact purchase list.

## How to test
1. Run `node tests/run-tests.mjs` and `node tests/estimate-engine.test.mjs`.
2. Run `node tests/assemblies.test.mjs` and `node tests/workspace-static.test.mjs`.
3. With Chrome/Chromium installed, run `node tests/workspace-browser.test.mjs`.
4. Open `workspace.html` via a local web server, select a single trade, and confirm other specialties are absent.
5. Explicitly request wall repair while a plumber's profile excludes it: it should be listed as excluded and not priced.
6. Enter confirmed measurements and unit costs, overhead/profit, approve, and review proposal privacy.

## Future backend work
Build editable per-trade task assemblies, deeper material/labor component rules, customer-approved site condition questions, regional pricebook mapping from SQLite, takeoff methods for drawings, and server-side user entitlement enforcement. Develop these incrementally with regression fixtures rather than treating any one electrical-panel example as the universal template.
