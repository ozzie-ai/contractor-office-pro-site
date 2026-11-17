# Contractor Office Pro — release gate and November 16 field-test postmortem

Status: **NOT READY FOR UNRESTRICTED CONTRACTOR DISTRIBUTION.** Working branch: integration/expo-fastapi-supabase-unified-20261115; draft PR #46.

## Physical iPhone incident

The owner dictated: “Install five new electrical outlets total: three standard outlets and two GFCI outlets. All wiring already exists. Replace the existing devices only.” App produced a generic one-line GFCI scope at $0. The email/AI verification UI confused the simple offline estimating workflow.

**Root cause:** The electrical quick parser covered only short phrases, not “five NEW ELECTRICAL outlets” plus an explicit three-standard/two-GFCI split. Generic fallback recognized only one GFCI. The previous tests did not cover the actual dictated sentence.

**Repair (commit 84f4d8e):** Full-sentence and bilingual counting, conflicting-count protection, two editable work items, illustrative five-device reference pricing, explicitly required contractor review before PDF export, optional cloud login hidden behind separate control, and regression tests.

The prior contractor example was $174 materials and $645 labor, or $819 base. The temporary split across 3 standard devices ($140 each) and 2 GFCI devices ($199.50 each) is NOT independently verified. With default 10% overhead and 20% profit the app displays $1,081.08 as an illustrative total, not a confirmed client bid. The rates must be edited/approved by a contractor. Never extrapolate to new circuits or unknown wiring.

## Actual component status

| Area | Real implementation | Release blocker |
|---|---|---|
| iPhone Expo | Physical installation and eight old saved jobs confirmed by owner; no deletion | Confirm latest mobile code on device, unchanged photos/jobs and job/PDF flow |
| Voice | iPhone keyboard dictation into editable notes; bilingual selector | Arbitrary multi-trade speech understanding and native audio pipeline unverified |
| Scopes | Dedicated electrical panel/outlets, selected bathroom, painting, cleaning examples | Broad plumbing, concrete and handyman cases can still be generic one-line placeholders |
| Pricing | Selected preliminary panel/painting/cleaning engines and guarded outlet example | No vetted unit-price coverage across all residential trades or live retailer pricing |
| PDF | Privacy-tested bundled customer price, scope, exclusions, bilingual | Actual iPhone-generated PDF/share test and contractor review |
| Private research | 535 MB original SQLite, 1,245 service refs, 15,446 modeled regional scenarios, 106,636 classified research decisions | Zero decisions approve a finished selling rate; 4 preliminary budgeting benchmarks only |
| Cloud | Supabase dev catalog of 1,674 RLS read-only refs, Render FastAPI live at 49cd6d5 | Real authenticated phone testing, account sync, media sync not verified |
| Native Swift | Separate Derek source under ios/ preserved | Not compiled on user Mac as part of Expo app |
| Android/distribution | Expo supports cross-platform in principle | Android physical build and production distribution untested |

## Release responsibilities and acceptance criteria

1. Contractor description (typed or spoken) always remains editable and private. Photo attachment must preserve local files. Unknown scope requires a targeted follow-up question, not invented tasks.
2. Supported trade parsing must produce correct quantities, units, and work items for varied real dictations in English and Spanish, with tests beyond scripted examples.
3. Pricing engine must use reviewable labor-hours, labor cost, materials, equipment, travel and waste; region and dated source metadata; overhead and profit once; never silently convert reference budgets into selling rates.
4. A quote must show usable provisional amounts when grounded, prominently mark their uncertainty, preserve edits, and block incomplete or unapproved PDFs.
5. Customer PDF must contain an understandable scope and final contractor-approved bundled selling price, no transcript, private labor/material costs, or private follow-up.
6. Local workflow must not demand cloud login or a paid OpenAI API key; keep zero development spending unless authorized.
7. Require passing code tests, integration tests, backend tenant isolation, actual iPhone save/reopen/photo/PDF test, and Android smoke/distribution tests before releasing beyond controlled beta.

**Near-term acceptance test:** dictate exact user outlet example → two correct item quantities (3+2) → $819 illustrative base / $1,081.08 example with 10% + 20% if defaults unchanged → edit/approve → accurate client-only PDF → saved job reopens. Test painting, panel and cleaning separately. Additional trades are NOT advertised as automatically priced until their own cost model and acceptance tests are completed.

**Preservation:** Keep bundle ID com.contractoroffice.contractor-office-pro and existing 8 local saved jobs/photos. Never uninstall, wipe, reset hard, auto-upload private data, merge draft PR #46 to main or start paid services without approval.