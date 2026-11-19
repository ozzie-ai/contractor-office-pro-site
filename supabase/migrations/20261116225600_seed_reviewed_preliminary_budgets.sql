-- Four reviewed *preliminary budget* ranges, not contractor-approved final unit rates.
-- Source: read-only Contractor_Office_Pro_Residential_Data.sqlite snapshot.
INSERT INTO public.cop_research_references
(reference_id,reference_kind,trade,service,unit,locality,low_usd,high_usd,planning_rate_usd,
 cost_basis,scope,exclusions,evidence_note,checked_on,recheck_on,review_status,budget_usable,automatic_final_quote)
VALUES
('COP-PL-001','reviewed_budget','Plumbing','Replace standard toilet — labor','each','US national; confirm locality',200,500,NULL,'labor',
 'Standard floor-mounted toilet replacement in existing position, normal access and usable existing plumbing.',
 'Toilet purchase, haul-away, flange/valve repairs, flooring, relocation, permits, taxes separate.',
 'Owner-authorized preliminary evidence/scope review; no contractor field sign-off','2026-11-09','2027-02-07','reviewed_preliminary_budget',TRUE,FALSE),
('COP-EL-001','reviewed_budget','Electrical','Electrician service — hourly benchmark','hour','US national; confirm locality',55,130,NULL,'reported_service_charge',
 'Published residential electrician hourly charge; task duration must be estimated independently.',
 'Minimum call-out, trip fees, materials, permits, emergency premiums and specialty work not included.',
 'Owner-authorized preliminary evidence/scope review; no contractor field sign-off','2026-11-09','2027-02-07','reviewed_preliminary_budget',TRUE,FALSE),
('COP-DW-001','reviewed_budget','Drywall','Drywall installation — general installed benchmark','sf_wall_surface','US national; confirm locality',1.50,3.25,NULL,'unit_and_install',
 'General wall drywall hanging/finishing; board and finish specifications must match.',
 'Demolition, painting, specialty assemblies, ceilings, access premium and minimums separate.',
 'Preliminary AI scope review; no contractor field sign-off','2026-11-09','2027-02-07','reviewed_preliminary_budget',TRUE,FALSE),
('COP-DW-002','reviewed_budget','Drywall','Drywall hanging and finishing — labor benchmark','sf_wall_surface','US national; confirm locality',1.00,2.40,NULL,'labor',
 'General wall drywall hanging/finishing labor; board and finish specifications must match.',
 'Demolition, painting, specialty assemblies, ceilings, access premium and minimums separate.',
 'Preliminary AI scope review; no contractor field sign-off','2026-11-09','2027-02-07','reviewed_preliminary_budget',TRUE,FALSE)
ON CONFLICT (reference_id) DO NOTHING;