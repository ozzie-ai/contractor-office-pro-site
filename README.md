# Contractor Office Pro — Pilot v44

**You Build. We Handle the Office.**

A bilingual, mobile-first contractor estimating prototype. Contractors can dictate in Spanish or English, confirm quantities and prices, and review an **English customer-facing construction proposal**.

**Public pilot:** https://ozzie-ai.github.io/contractor-office-pro-site/?v=44&lang=es

## Planned launch order
1. Electrical (including EV charging, breakers, GFCI, lighting and panel upgrades)
2. Plumbing
3. Painting
4. Concrete
5. Handyman
6. General remodeling (kitchens, bathrooms, apartment turnovers and whole-home jobs)

Trade categories exist in the interface, but not every category is fully validated or ready for paying users.

## Customer-facing English proposal (v43–v44)
- Spanish dictation remains in the contractor's private visit information, not in the customer proposal or outgoing email body.
- English work-item descriptions are based on known bilingual catalog mappings and contractor review, not a translation API.
- Unknown/non-mapped item descriptions require the contractor to enter and confirm accurate English wording before sharing.
- Customer proposal, downloaded HTML, copied estimate and opened email compose flows use English work descriptions and scope notes.
- Optional contractor license, business address, proposal validity and permit responsibility can be entered.
- Proposals are **preliminary estimates, not legally compliant home-improvement contracts**. They do not replace statutory contract notices, rights of cancellation, payment schedule, signatures or legal review.

## Testing
Anonymized manual regression examples are in `tests/scenarios.json`.
Run locally: `node tests/run-tests.mjs`.
GitHub Actions workflow `.github/workflows/regression.yml` runs checks when the app or tests change.
**Current limits:** EV speech-parser tests have programmatic assertions. The panel-upgrade scenario is documented but still requires browser-level/end-to-end acceptance tests. Other trades require separate validated fixtures. Fixing code is not automatic ML model training.

## Prototype limitations
- Static GitHub Pages deployment; no customer accounts, cloud database, payment processor, pricing feed or automatic email delivery.
- Photos and visit data are handled locally; no automatic synchronization or storage of customer projects.
- Browser speech recognition may depend on vendor services.
- Prices are illustrative and must be verified. Assumptions, electrical sizing, permit fees and material specifications require review.
- Exported drafts are saved by the contractor; there is no automatic central project archive.

## Development safety
Never insert unreviewed dictation or private transcripts into customer-facing proposals. Treat any unpriced, excluded or future work distinctly. Avoid marking a draft a completed contract.
