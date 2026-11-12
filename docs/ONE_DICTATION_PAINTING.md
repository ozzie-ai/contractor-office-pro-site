# One-dictation house painting — original Contractor Office Pro

## Goal
The contractor describes a painting job once, in Spanish or English. The original app should compute floor area, gross/estimated net walls, paint quantity, job labor hours and a priced draft **without asking the contractor to re-enter every room, height, gallons, and shopping item**. The contractor can edit original line items, overhead and profit. This is not a separate workspace.

## Reference dictation
> Vamos a pintar una casa donde tiene tres habitaciones: primera habitación 15 por 15, segunda habitación 12 por 15, tercera habitación 22 por 12, primer baño 7 por 10, segundo baño 7 por 5, cocina 10 por 10, comedor y sala 15 por 20, y 3 closets de tres por siete.

Expected geometric takeoff:
- Bedroom 1: 15 × 15 = 225 sq ft
- Bedroom 2: 12 × 15 = 180 sq ft
- Bedroom 3: 22 × 12 = 264 sq ft
- Bathroom 1: 7 × 10 = 70 sq ft
- Bathroom 2: 7 × 5 = 35 sq ft
- Kitchen: 10 × 10 = 100 sq ft
- Combined living and dining: 15 × 20 = 300 sq ft
- Three closets: 3 × (3 × 7) = 63 sq ft
- **Total floor area: 1,237 sq ft**
- Total inside perimeters: 410 linear ft
- Gross wall area at assumed 8-foot height: 3,280 sq ft
- Estimated net wall surface with provisional 10% doors/windows allowance: 2,952 sq ft
- Walls only, two coats, 350 sq ft per gallon per coat and 10% waste: **19 gallons**

## Illustrative planning costs (NOT verified labor market rates)
| Description | Basis | Cost |
|---|---|---:|
| Interior wall paint | 19 gal × $37.98 **cached retail reference** | $721.62 |
| Ordinary masking/preparation | 2,952 sq ft × $0.10 **allowance** | $295.20 |
| Painting labor | 42.5 total labor-hr × $60/hr **planning assumption** | $2,550.00 |
| Mobilization and purchasing | One job allowance | $75.00 |
| Direct cost | | $3,641.82 |
| Overhead | 10% | $364.18 |
| Profit | 20% on direct cost + overhead | $801.20 |
| **Illustrative draft selling price** | | **$4,807.20** |

These are default editable assumptions to produce a useful starting estimate; not a guaranteed competitive or safe final bid. Physical conditions, wall height, coatings, paint quality, detailed prep, access, repairs, multi-day travel, trim, doors and ceilings can change costs.

## User experience
1. Select Painting, speak or paste the job description on the existing screen.
2. Tap **Continue** once.
3. The original app skips the large paint dimensions questionnaire **only if it identified and measured every described room group**.
4. Show the standard four editable price groups and concise assumptions. The material takeoff is available inside the existing estimate UI.
5. Customer proposal uses organized rooms and scope notes, never the original private transcription.

If rooms or dimensions are missing, the new fast path does not guess completion and the older review flow remains available. Explicit ceiling painting is supported by adding ceiling area and labor; ceilings remain excluded when not mentioned. The default customer proposal language follows the interface language unless manually selected.

## Modules / tests
- `core/quick-paint.js`: pure voice-text room parsing, measurements and draft cost model.
- `core/quick-paint-flow.js`: bridge to original interface and existing cost editor.
- `tests/quick-paint.test.mjs`: Spanish/English parsing, area, quantities, assumption controls, and scope safety.
- `tests/quick-paint-browser.test.mjs`: actual original Chrome UI, one Continue to estimate, no extra questionnaire, four priced rows, proper customer scope and proposal privacy.

This one scenario is a **regression example, not a restriction on supported trades**. Next backend priorities are shared production-rate templates, cross-trade recognition and contractor-specific labor costs, not additional forms.
