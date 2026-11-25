# 0006 — AI ballpark prices for lines with no price

Date: 2026-11-25 · Status: accepted (Derek)

## Context
Pricing was contractor price → regional reference → "Needs price". The reference catalog is still tiny (three
labeled LA allowances), so most AI-drafted lines arrived unpriced. In testing, Derek found the AI "didn't generate the
prices itself", which made the draft feel unfinished for the target users (small, often less technical contractors).

## Decision
Add a fourth, opt-in step to `/v1/estimate/price` (`ai_ballpark: true`; the iOS app sends it):

- For lines still without a price, the model returns **cost inputs only**: labor hours per unit, typical local labor
  rate (wage + burden), material and equipment cost per unit, and a short basis.
- **Code computes the price**: `(hours × rate + material + equipment) × (1 + overhead) × (1 + profit)` with the
  business's own markup, Decimal, rounded to cents. Inputs outside sane bounds are dropped (line stays "needs price").
- Lines are `price_source = "ai_estimate"`, `basis = "ai_ballpark"`, `preliminary = true`, `confidence = "low"`,
  `source_name = "AI ballpark"`, with the basis in the note. Never overwrites contractor or reference prices.
- If the AI call fails or is rate limited, the deterministic prices are still returned.
- The app shows an "AI ballpark · check" badge, a one-tap "This price looks right" (which saves it to the price book
  when the task has a code), and a reminder on the send sheet. Ballparks don't block sending; missing prices still do.

## Consequences
- Principle 2 now reads: the model never outputs prices or totals; it may estimate cost inputs that code turns into a
  clearly labeled, preliminary ballpark. Principle 3 holds: nothing is silently filled in.
- Older app builds don't send `ai_ballpark` and keep the previous behavior.
- Replace ballparks with licensed regional references as the catalog grows; contractor-confirmed prices feed the
  price book so the AI is needed less over time.
