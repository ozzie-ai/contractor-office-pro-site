# Contractor Office Pro owned pricing library

This is a business-owned PostgreSQL schema, NOT yet a live cloud database. An owner creates a Supabase project and applies the migration. Never put a service-role key in a phone app or public repository.

## Architecture
- Trade task dictionary: bilingual descriptions and units.
- Regions: metro, state, and city-level observations; no arbitrary wealthy-ZIP markups.
- Provenance: source, copyright/license permission, date, and confidence.
- Unit costs: verified labor production hours, employee wage, burden factor, materials, equipment, and other direct costs.
- Contractor rate overrides: private selling prices, separated from reference observations.
- Quote pricing: compute direct costs, then overhead and profit; detect any already-marked-up unit bid before adding margins.

## Reuse rules
- California EDD OEWS: data is CC BY, with attribution and stated public reuse rights: https://publish.data.ca.gov/dataset/oews
- Caltrans historical bids: https://sv08data.dot.ca.gov/ . Verify site conditions before bulk copying; civil bid prices do not directly equal residential project prices.
- Gordian Los Angeles Community Development Authority Construction Task Catalog: the user's 2026 catalog expressly restricts use to its licensed contracting purpose without written consent. Do not bulk import its records without permission.
- Contractor invoices, production hours, and approved owner-entered estimates may be saved into our own data pool, subject to tenant/customer privacy.

## Deployment steps
1. Owner creates a Supabase database project.
2. Run database/migrations/001_pricing_catalog.sql using an administrative SQL session.
3. Run database/seed/001_original_tasks.sql; this inserts original task names and regions but no unverified prices.
4. Import permitted external data through a separate normalization and validation pipeline with source IDs, time stamps, geographic specificity, and original units.
5. Create a server-only API with contractor authentication. Do not expose privileged keys to React Native.
6. Test regional fallback, fresh/stale prices, unit conversion, duplicate IDs, rejected unlicensed sources, and estimate math.

## Pricing algorithm
Direct cost per unit = hourly employee wage * labor burden * hours per unit + materials + equipment + other direct costs.
Selling price = direct cost * (1 + overhead) * (1 + profit).
A historical bid price can include markups; benchmark it separately rather than stacking markup blindly.

## Status
Schema and bilingual original task taxonomy are committed. A cloud Supabase instance, data imports, production authentication, and online mobile lookup are **not yet deployed**. The mobile app currently calculates electrical costs locally.
