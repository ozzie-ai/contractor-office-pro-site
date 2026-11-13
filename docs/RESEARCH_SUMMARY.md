# Research summary (Nov 2026)

Condensed from the full market/feasibility report. Verify prices and features before relying on them.

## Positioning
- AI photo/voice-to-estimate is now table stakes (Handoff, Markate Kate AI, Joist, many small apps). Not a moat.
- Defensible combo, in priority order:
  1. State-compliant contract engine (CA B&P §7159 first), built by a licensed GC.
  2. Price book learned from the contractor's own receipts (gets better with use).
  3. Spanish-first **owner** experience + bilingual client documents.
  4. Offline estimate drafting on site.
- Jobber's mobile app is Spanish for non-admins only; Housecall Pro has Spanish at all roles but QuickBooks sync needs its $149+/mo plan.
- Small Spanish-focused competitors exist (Jobkore, Crea, CHAKY, La Chamba Pro, DripJobs Español) — mostly estimates/invoices only.

## Market
- ~2.9M construction nonemployer businesses (2022–23); ~1.9M specialty trades.
- ~27.6% (~770K) of construction nonemployers Hispanic-owned (2021); most earn <$100K/yr. TX, FL, CA lead.
- Implication: price around $19–29/mo solo (below Jobber Core $49 monthly / Housecall Pro $59–79).

## What contractors say
- Top complaints: price jumps per user, complexity built for teams, weak support, lock-in.
- AI estimates are welcomed as drafts/checklists, distrusted as pricing authority. Keep human approval; show AI vs price-book sources.

## Feasibility notes
- **Material prices:** no official public Home Depot/Lowe's API; scraping = ToS/breakage risk. Primary source = user's own receipts.
- **SMS:** start with native composer. Twilio A2P 10DLC for sole proprietors is limited (1 campaign, 1 number, OTP, low throughput) — defer.
- **Email:** don't resell Google Workspace. Send estimates from the user's own domain via Postmark/Resend after DNS (SPF/DKIM/DMARC) verification.
- **CA contracts:** see CLAUDE.md compliance section. Civil Code §1632 translation mandate excludes home improvement contracts, so Spanish copies are a feature, not a requirement — state which language controls.

## Validate during own use
- AI estimate vs. final approved price vs. actual job cost (target <10–15% line-item deviation).
- Time from site walk to estimate sent.
- % of BOM items priced from own receipts.
- Contract-compliance catches (deposit cap, missing notices).
- 10–20 interviews with Spanish-speaking owner-operators on willingness to pay ($19 vs $39).
