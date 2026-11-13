# ContractorOfficePro — Roadmap

Nov 6, 2026 · @Derek

> **Update 2026-11-12:** the app stays native Swift. Derek also builds the backend the team asked for (multi-trade AI interpretation + pricing, OpenAI). See CLAUDE.md and docs/decisions/0003-native-swift-client.md.

## Vision and principles

A bilingual (English/Spanish) iOS app that runs the office side of a small trades business from the truck: voice and photo capture to estimates, invoices, expenses, scheduling and client texting. Built for Derek's own solo GC work first; productized only if it earns daily use.

- **Wedge:** voice memo + photos to a professional bilingual estimate in minutes. Everything else hangs off that loop.
- **AI drafts, the contractor decides.** No price, schedule or message goes to a client without a tap.
- **Solo-first, dispatch-ready.** Single user now; data model supports crews later without a rewrite.
- **Offline-first.** Capture works with no signal and syncs later.
- **Spanish is first-class,** not a translation layer: UI, trade terminology, client-facing documents and messages.
- **Integrate, don't rebuild:** QuickBooks/Xero for accounting, Stripe for payments, Twilio for SMS, Google Workspace for email.
- **Phase gate:** don't start a phase until the previous one has been used on real jobs for about two weeks.

## Market and feasibility

Technically feasible with today's tools, and the audience is large. But AI voice/photo-to-estimate is no longer unique, so the edge has to be the Spanish-speaking owner-operator and an all-in-one, solo-priced bundle.

**Audience.** Hispanic workers are 32.8% of the US construction labor force (2024), up from 23.6% in 2010. In California the share is 59.7%, in Texas 61.3%. ([NAHB, Oct 2026](https://eyeonhousing.org/2026/10/nearly-one-in-three-construction-workers-are-hispanic/))

**AI appetite.** In a Housecall Pro survey of 400+ home service contractors, over 70% had tried AI tools and about 40% use them actively, mostly for back-office work. ([Cleaner, 2025](https://www.cleaner.com/online_exclusives/2025/06/survey-finds-many-home-service-pros-using-ai-tools-to-streamline-admin-work))

**Key gap.** Jobber's Spanish app is only for non-admins: Spanish speakers are treated as crew, and the owner must run the business in English. ([Jobber help](https://help.getjobber.com/hc/en-us/articles/17188033308567)) Housecall Pro does offer Spanish to all users. ([Housecall Pro help](https://help.housecallpro.com/en/articles/10553447))

| Competitor | What overlaps | Gap for us |
| --- | --- | --- |
| [Jobber](https://contractortoolstack.com/software/jobber/pricing/) | Quotes, scheduling, routing, invoicing, two-way SMS; solo Core plan $49/mo ($29/mo annual) | Spanish for crew only; AI receptionist is a paid add-on |
| [Housecall Pro](https://help.housecallpro.com/en/articles/10553447) | Full field-service suite, Spanish app, AI features | Built for growing shops; no built-in routing optimization |
| [Handoff](https://handoff.ai/ai-site-walkthrough) | Photos + voice to line-item estimate, proposals, payments | Remodeler-focused; English-first |
| [Markate Kate AI](https://norfolkdailynews.com/online_features/press_releases/markate-launches-kate-ai-estimator-close-jobs-in-60-seconds-or-less/article_1d873f51-add8-5576-9d1b-6486c32b1804.html) | Photo/voice estimator plus AI dispatcher (launched Apr 2026) | Bolted onto an existing FSM platform |
| Single-purpose AI estimators (BidBeam, EZ-Estimates, Construction+) | Photo/voice to estimate | Estimate only; no books, scheduling or comms |

**Feasibility by area**

- **Estimates, receipts, calendar, push, SMS from own number:** low risk, proven tech.
- **Routing and rescheduling:** medium; solved by OR-Tools plus a travel-time API.
- **Automated SMS, email provisioning, payments:** medium; mostly paperwork (10DLC, reseller terms, Stripe onboarding).
- **Local material pricing:** high; no open retailer APIs. Mitigation: learn prices from the user's own receipts.
- **Bookkeeping:** keep it light and sync to QuickBooks/Xero rather than becoming an accounting system.

**Biggest product risk:** an all-in-one app that does ten things at 70%. Win the estimate loop first.

As of November 2026; competitor pricing and features change often.

## Tech stack

SwiftUI on device, Supabase plus a small Python service on the backend; LLMs interpret, solvers and code compute.

| Layer | Choice | Why |
| --- | --- | --- |
| iOS app | SwiftUI, SwiftData | Native, offline-first local store |
| Localization | Xcode String Catalogs (EN/ES) | Spanish from day one, no hardcoded strings |
| Backend | Supabase (auth, Postgres, storage, sync) | Free to start; $25/mo Pro when relied on |
| Custom logic | Python (FastAPI) | LLM pipelines, PDF generation, OR-Tools solver |
| Transcription | Apple Speech or Whisper | Voice memos to text |
| Estimate drafting | Claude API, structured JSON output | Line items pulled from the personal price book |
| Receipt OCR | Apple Vision (on device) + LLM categorizing | Free OCR, tax-bucket categories |
| Calendar / push | EventKit, APNs | Sync with phone calendar; reminders |
| Payments | Stripe payment links | No upfront cost |
| SMS | iOS message composer, later Twilio (10DLC) | Free first, automated later |
| Email | Postmark or Resend for sending from the business domain | Estimates sent from the contractor's own domain |
| Routing | OR-Tools + travel-time matrix API | Real optimization, not LLM guesses |
| Dev tools | Xcode on M1 Pro, Claude Code in VS Code | Already in place |

## Roadmap

Each phase starts only after the previous one has been used on real jobs for about 2 weeks.

### Phase 0 · Foundations (1–2 weeks)
- Xcode project, SwiftUI + SwiftData offline store, Supabase auth, storage and sync
- Core data model: Client, Job, Estimate, LineItem, Expense, Receipt, Media, Members
- EN/ES string catalogs; `org_id` and `assigned_to` on every record

### Phase 1 · Capture → estimate → send (4–6 weeks) — THE CORE
- Jobs with photos and voice memos; transcription to an editable line-item estimate
- Personal price book drives pricing; branded PDF in English or Spanish
- California home-improvement contract compliance (B&P §7159 / §7159.5) on generated estimates/contracts
- Send by text from own number (MFMessageComposeViewController) or by email; clock in/out per job

### Phase 2 · Money in and out (3–4 weeks)
- Accepted estimate → invoice; Stripe payment links (deposit capped per CA law)
- Receipt capture: on-device OCR, tax categories, line items + store + date saved; mileage tracking
- Profit and loss per job and month, CSV/QuickBooks export; estimates sent from own domain

### Phase 3 · Schedule and reminders (2–3 weeks)
- Job calendar synced with phone calendar (EventKit); push reminders and estimate follow-ups
- Drive time between jobs, one-tap "optimize my day", running-late texts
- License, insurance and COI expiration tracking; Twilio reminders after 10DLC registration

### Phase 4 · Smarter scheduling and materials (ongoing)
- "Fit this job in" slot suggestions, workload view, rescheduling proposals (OR-Tools)
- AI bill of materials and shopping list by store; prices learned from own receipts
- Subcontractor coordination by text link: address, date, scope, photos

### Phase 5 · Productize (only if it earns it)
- Crew members, roles and dispatch; two-way SMS inbox; per-customer numbers
- QuickBooks/Xero sync, Plaid bank feeds, subscriptions, App Store launch
- Business-in-a-box onboarding: domain, email, logo, state contract templates

Timelines assume part-time work. Phase 5 happens only if the app proves itself on our own jobs.

## Costs

About $99 up front, then roughly $0–30/month plus a few dollars of AI usage during own-use phases.

| Item | Cost | When |
| --- | --- | --- |
| Apple Developer Program | $99/year | Now (needed for TestFlight and push) |
| Mac + Xcode | $0 (M1 Pro already owned) | Now |
| Supabase | Free tier; Pro $25/mo | Pro once used on real jobs |
| LLM + transcription APIs | Pennies per estimate; set a monthly cap | Phase 1 |
| Stripe | Per-transaction fee only | Phase 2 |
| Business domain + email | Domain \~$10–20/yr plus mailbox plan | Optional, anytime |
| Twilio / 10DLC | Small recurring per number and per message | Phase 3 |
| Travel-time API | Free tier or self-hosted OSRM | Phase 3 |

Sources: [Apple](https://developer.apple.com/support/purchase-activation), [Supabase pricing summary](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/).

## Build in from day one

Cheap decisions now that avoid a rewrite when the app gains crews, automation or paying users.

- **`org_id` on every table** so one install can become many businesses.
- **Members table** with one row (owner); every job and calendar block has `assigned_to`, defaulting to the owner.
- **Client record** stores preferred language and SMS consent status.
- **Clock in/out per job** to capture actual hours; compare with estimated hours for scheduling and pricing.
- **Receipts keep line items, store and date,** not just totals; this becomes the local price database.
- **Personal price book** of labor rates and common items; the AI pulls from it instead of guessing.
- **Every AI output is a draft** with an explicit send/approve step.

## Open questions and next steps

- [ ] Enroll in the Apple Developer Program
- [ ] Decide which job types make up most estimates (shapes the price book and estimate templates)
- [ ] Draft the personal price book: labor rates, markup, common items
- [ ] Collect 3–5 past estimates to test AI drafts against
- [ ] Confirm the license number and contract language your estimates must carry in California
- [ ] Pick the app's working name and buy the domain
- [ ] Scaffold Phase 0 in Claude Code: Xcode project, Supabase schema, EN/ES string catalogs
