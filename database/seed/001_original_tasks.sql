-- Starter owned task taxonomy: original descriptions, NO third-party catalog rates.
insert into public.price_sources(name,source_url,publisher,license_name,commercial_reuse_allowed,attribution,terms_checked_on,notes)
values
('California EDD OEWS','https://publish.data.ca.gov/dataset/oews','California Employment Development Department','CC BY',true,'California Employment Development Department — Occupational Employment and Wage Statistics',date '2026-11-08','Employee wage benchmarks; not installed-work unit rates.'),
('Contractor Office Pro Internal','https://github.com/ozzie-ai/contractor-office-pro-site','Contractor Office Pro','owner_created',true,'Contractor Office Pro',date '2026-11-08','Contractor-entered verified prices, hours and production rates.')
on conflict(name) do nothing;

insert into public.price_regions(region_code,state_code,region_name,city,locality_type)
values
('US-CA-LA','CA','Los Angeles metropolitan area',null,'metro'),
('US-CA-SANTA-MONICA','CA','Santa Monica','Santa Monica','city'),
('US-CA-BEVERLY-HILLS','CA','Beverly Hills','Beverly Hills','city'),
('US-CA-SANTA-CLARITA','CA','Santa Clarita','Santa Clarita','city'),
('US-ID','ID','Idaho statewide',null,'state')
on conflict(region_code) do nothing;

insert into public.trade_tasks(code,trade,title_en,title_es,scope_en,scope_es,unit) values
('ELEC.PANEL.UPGRADE','electrical','Electrical panel / service upgrade','Actualización de panel / servicio eléctrico','Service and distribution panel equipment and installation; actual rating and scope to be confirmed','Equipo e instalación de panel; confirmar amperaje y alcance','job'),
('ELEC.CIRCUIT.TRANSFER','electrical','Transfer existing branch circuit to new panel','Transferir circuito existente a panel nuevo','Disconnect, move and reconnect an existing branch circuit; no new home run by default','Desconectar, trasladar y reconectar circuito existente; no incluye cableado nuevo por defecto','each'),
('ELEC.BREAKER.ONLY','electrical','Install breaker only (no new wiring)','Instalar únicamente breaker (sin cableado nuevo)','Install suitable breaker; future feeder and terminations excluded','Instalar breaker compatible; excluye alimentador y conexiones futuras','each'),
('ELEC.PERMIT','electrical','Electrical permit allowance','Permiso eléctrico','Permit amount from jurisdiction or customer-supplied verified allowance','Monto del permiso según jurisdicción o dato verificado','job'),
('ELEC.RECESSED.LIGHT','electrical','Install recessed ceiling light','Instalar luz empotrada de techo','Verify wiring, ceiling height, fixture and access','Confirmar cableado, altura, luminaria y acceso','each'),
('ELEC.GFCI','electrical','Install GFCI receptacle','Instalar tomacorriente GFCI','Verify wiring and protection','Confirmar cableado y protección','each'),
('PLUMB.FAUCET.REPLACE','plumbing','Replace existing faucet','Reemplazar grifo existente','Remove and replace faucet, verify hookups','Retirar y reemplazar grifo, verificar conexiones','each'),
('PAINT.INTERIOR.SF','painting','Interior painting','Pintura interior','Area and surface preparation separately confirmed','Confirmar área y preparación de superficie','sq ft'),
('CONCRETE.SLAB.CY','concrete','Place concrete slab','Colocar losa de concreto','Mix, thickness, access, grading, reinforcement and finish require confirmation','Confirmar mezcla, espesor, acceso, preparación, refuerzo y acabado','cu yd'),
('HANDY.GENERAL.HR','handyman','General handyman labor','Trabajos varios por hora','Specific work item to confirm','Confirmar trabajo específico','hr'),
('REMODEL.BATH.JOB','remodel','Bathroom renovation scope review','Revisión de remodelación de baño','Estimate from verified individual tasks, not one universal bathroom price','Estimar por partidas verificadas, no con un precio universal de baño','job'),
('CLEAN.RESIDENTIAL.SF','cleaning','Residential cleaning area','Área de limpieza residencial','Hours depend on conditions, rooms, visit frequency','Horas dependen de condición, habitaciones y frecuencia','sq ft')
on conflict(code) do nothing;
-- Intentionally no seeded unit costs: wage data cannot be silently
-- converted to a finished job price without explicit production assumptions.
