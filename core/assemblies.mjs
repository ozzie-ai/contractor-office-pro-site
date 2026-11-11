/**
 * Contractor Office Pro — trade-scoped assembly planner, v1.
 * No network calls, user data, vendor price tables, or automatic work authorizations.
 * Assemblies define candidate work in normal job order. The contractor controls scope.
 */
export const TRADES = Object.freeze([
  {id:'electrical',en:'Electrical',es:'Electricidad'},
  {id:'plumbing',en:'Plumbing',es:'Plomería'},
  {id:'painting',en:'Painting',es:'Pintura'},
  {id:'drywall',en:'Drywall',es:'Drywall / Tablaroca'},
  {id:'concrete',en:'Concrete',es:'Concreto'},
  {id:'flooring',en:'Flooring / Tile',es:'Pisos / Loseta'},
  {id:'roofing',en:'Roofing',es:'Techos'},
  {id:'stucco',en:'Stucco',es:'Estuco'},
  {id:'hvac',en:'HVAC',es:'Climatización'},
  {id:'doors',en:'Doors / Windows',es:'Puertas / Ventanas'},
  {id:'fencing',en:'Fencing',es:'Cercas'},
  {id:'landscape',en:'Landscaping',es:'Jardinería'},
  {id:'cleaning',en:'Residential Cleaning',es:'Limpieza residencial'},
  {id:'handyman',en:'Handyman',es:'Reparaciones'},
  {id:'remodel',en:'General Remodeling',es:'Remodelaciones'}
]);
export const CAPABILITIES=Object.freeze([
  {id:'wall_repair',trade:'drywall',en:'Patch drywall / plaster',es:'Reparar paredes / yeso'},
  {id:'stucco_repair',trade:'stucco',en:'Exterior stucco patching',es:'Resanar estuco exterior'},
  {id:'painting_finishes',trade:'painting',en:'Painting after other work',es:'Pintura después de otros trabajos'},
  {id:'insulation',trade:'drywall',en:'Install insulation',es:'Instalar aislamiento'},
  {id:'pet_waste',trade:'cleaning',en:'Pet-waste cleanup',es:'Limpiar desechos de mascotas'},
  {id:'outdoor_cleaning',trade:'cleaning',en:'Clean yards / patios',es:'Limpieza de patios'}
]);
const IDS=new Set(TRADES.map(x=>x.id));
const VALID_CAPS=new Set(CAPABILITIES.map(x=>x.id));
const unique = xs => [...new Set(xs)];
function t(id,trade,phase,en,es,unit,costType,measure,extra={}) {
  return Object.freeze({id,trade,phase,en,es,unit,costType,measure,...extra});
}
// Only repeatable, bounded workflows are initially modeled. New assemblies
// may be added without changing the pricing engine or unrelated trades.
export const ASSEMBLIES=Object.freeze([
  {id:'room_painting',trade:'painting',en:'Paint room walls',es:'Pintar paredes de habitaciones',keywords:/\bpaint(?:ing)?\b|pintar|pintura/i,
   facts:['wallAreaSf'], tasks:[
    t('protect_room','painting','Preparation','Protect floors and furnishings','Proteger pisos y muebles','job','labor','one'),
    t('prep_wall','painting','Preparation','Patch minor surface defects and prepare walls','Preparar y resanar detalles menores','sf','labor','wallAreaSf'),
    t('paint_supply','painting','Materials','Wall paint and supplies','Pintura y materiales','gal','material','paintGallons'),
    t('apply_paint','painting','Application','Apply specified paint coats','Aplicar capas de pintura','sf','labor','wallAreaSf'),
    t('cleanup_paint','painting','Closeout','Remove masking and clean workspace','Retirar protección y limpiar','job','labor','one'),
    t('paint_ceiling','painting','Optional','Paint ceilings','Pintar cielos','sf','labor','ceilingAreaSf',{condition:'paintCeiling',mode:'opt_in'})
  ]},
  {id:'drywall_install',trade:'drywall',en:'Hang and finish drywall',es:'Instalar y acabar drywall',keywords:/drywall|tablaroca|sheetrock|plasterboard/i,
   facts:['wallAreaSf'],tasks:[
    t('check_framing','drywall','Preparation','Check framing and dimensions','Revisar estructura y medidas','job','labor','one'),
    t('insulate','drywall','Optional','Install cavity insulation','Instalar aislamiento','sf','material','wallAreaSf',{condition:'addInsulation',mode:'opt_in',capability:'insulation'}),
    t('drywall_boards','drywall','Materials','Drywall sheets including specified waste','Paneles de drywall con desperdicio','sf','material','wallAreaSf'),
    t('hang_drywall','drywall','Installation','Hang and fasten drywall','Instalar y fijar drywall','sf','labor','wallAreaSf'),
    t('tape_finish','drywall','Finishing','Tape, joint compound and required finish level','Cinta, compuesto y acabado indicado','sf','labor','wallAreaSf'),
    t('sand_finish','drywall','Finishing','Sand and prepare surface','Lijar y preparar superficie','sf','labor','wallAreaSf'),
    t('texture_finish','drywall','Optional','Apply specified texture','Aplicar textura indicada','sf','labor','wallAreaSf',{condition:'addTexture',mode:'opt_in'}),
    t('paint_after_drywall','painting','Optional','Prime and paint finished drywall','Sellar y pintar drywall terminado','sf','labor','wallAreaSf',{condition:'addPaint',mode:'opt_in',capability:'painting_finishes'}),
    t('clean_drywall','drywall','Closeout','Clean up drywall debris','Limpiar residuos de drywall','job','labor','one')
  ]},
  {id:'faucet_replacement',trade:'plumbing',en:'Replace a faucet',es:'Reemplazar grifo',keywords:/faucet|grifo|llave\s+de\s+agua|mezcladora/i,
   facts:['fixtures'],tasks:[
    t('protect_faucet','plumbing','Preparation','Protect area, isolate water and assess accessible connections','Proteger área y aislar agua','ea','labor','fixtures'),
    t('remove_faucet','plumbing','Removal','Remove existing faucet','Retirar grifo existente','ea','labor','fixtures'),
    t('new_faucet_material','plumbing','Materials','Replacement faucet (only if contractor supplies)','Grifo nuevo (si lo proporciona el contratista)','ea','material','fixtures',{condition:'contractorSupplies',mode:'opt_in'}),
    t('install_faucet','plumbing','Installation','Install faucet and connect existing accessible supplies','Instalar grifo y conectar líneas accesibles','ea','labor','fixtures'),
    t('leak_test','plumbing','Closeout','Test operation and check for leaks','Probar funcionamiento y fugas','ea','labor','fixtures'),
    t('open_wall','plumbing','Optional','Open wall for concealed plumbing access','Abrir pared para acceso','sf','labor','patchAreaSf',{condition:'wallAccess',mode:'opt_in'}),
    t('patch_wall','drywall','Optional','Patch disturbed wall area','Reparar pared intervenida','sf','labor','patchAreaSf',{condition:'patchWall',mode:'opt_in',capability:'wall_repair'})
  ]},
  {id:'concrete_slab',trade:'concrete',en:'Install small concrete slab',es:'Instalar losa de concreto',keywords:/concrete|concreto|slab|losa|patio|driveway/i,
   facts:['lengthFt','widthFt','depthIn'],tasks:[
    t('prepare_concrete_site','concrete','Preparation','Layout, prepare and compact subgrade','Trazar, preparar y compactar base','sf','labor','slabAreaSf'),
    t('forms_concrete','concrete','Formwork','Set and remove perimeter forms','Instalar y retirar formaleta','lf','material','slabPerimeterFt'),
    t('reinforcement_concrete','concrete','Optional','Provide specified reinforcement','Instalar refuerzo indicado','sf','material','slabAreaSf',{condition:'reinforcement',mode:'opt_in'}),
    t('ready_mix_concrete','concrete','Materials','Concrete volume before waste adjustment','Volumen de concreto sin desperdicio','yd3','material','slabVolumeYd3'),
    t('place_finish_concrete','concrete','Installation','Place, finish and cure concrete per specification','Colocar y terminar concreto','sf','labor','slabAreaSf'),
    t('cut_control_joints','concrete','Closeout','Provide control joints as specified','Hacer juntas de control según diseño','sf','labor','slabAreaSf'),
    t('haul_excavation','concrete','Optional','Haul surplus excavation','Retirar material excavado','yd3','equipment','excavationYd3',{condition:'haulExcavation',mode:'opt_in'})
  ]},
  {id:'house_cleaning',trade:'cleaning',en:'Residential interior cleaning',es:'Limpieza interior residencial',keywords:/clean|limpi(eza|ar)|housekeeping|maid/i,
   facts:['floorAreaSf'],tasks:[
    t('prepare_clean','cleaning','Preparation','Prepare supplies and protect belongings','Preparar materiales y proteger pertenencias','job','labor','one'),
    t('surfaces_clean','cleaning','Cleaning','Clean reachable interior surfaces','Limpiar superficies interiores','sf','labor','floorAreaSf'),
    t('bathroom_clean','cleaning','Cleaning','Clean and sanitize bathrooms','Limpiar y desinfectar baños','ea','labor','bathrooms',{condition:'bathroomsIncluded',mode:'opt_in'}),
    t('floors_clean','cleaning','Cleaning','Vacuum and mop applicable floors','Aspirar y trapear pisos','sf','labor','floorAreaSf'),
    t('pet_waste_clean','cleaning','Optional','Remove pet waste from designated areas','Recoger desechos de mascotas','sf','labor','petAreaSf',{condition:'petWaste',mode:'opt_in',capability:'pet_waste'}),
    t('patio_clean','cleaning','Optional','Clean outdoor patio or yard','Limpiar patio exterior','sf','labor','patioAreaSf',{condition:'patioIncluded',mode:'opt_in',capability:'outdoor_cleaning'}),
    t('final_check_clean','cleaning','Closeout','Final walkthrough and dispose of routine cleaning waste','Revisión final y desecho de basura rutinaria','job','labor','one')
  ]},
  {id:'floor_tile',trade:'flooring',en:'Install floor tile',es:'Instalar piso de loseta',keywords:/floor|piso|tile|loseta|porcelanato/i,
   facts:['floorAreaSf'],tasks:[
    t('tile_surface_prep','flooring','Preparation','Assess and prepare substrate','Revisar y preparar superficie','sf','labor','floorAreaSf'),
    t('tile_material','flooring','Materials','Tile including planned waste','Loseta con desperdicio previsto','sf','material','tileOrderSf'),
    t('tile_setting_material','flooring','Materials','Thinset, grout and setting accessories','Adhesivo, boquilla y accesorios','sf','material','floorAreaSf'),
    t('tile_install','flooring','Installation','Set, grout and clean tile','Instalar, emboquillar y limpiar loseta','sf','labor','floorAreaSf'),
    t('remove_old_floor','flooring','Optional','Remove existing flooring','Retirar piso existente','sf','labor','floorAreaSf',{condition:'removeExisting',mode:'opt_in'}),
    t('install_baseboard','flooring','Optional','Install baseboard','Instalar zócalo','lf','labor','baseboardLf',{condition:'baseboard',mode:'opt_in'})
  ]},
  {id:'roof_patch',trade:'roofing',en:'Localized roof repair',es:'Reparación localizada de techo',keywords:/roof|techo|gotera|leak|shingle|teja/i,
   facts:['repairAreaSf'],tasks:[
    t('roof_safety_setup','roofing','Preparation','Access and protect roof work area','Preparar acceso y protección','job','labor','one'),
    t('remove_damaged_roof','roofing','Removal','Remove damaged roofing within approved repair area','Retirar material dañado en área acordada','sf','labor','repairAreaSf'),
    t('roof_underlayment','roofing','Materials','Replacement underlayment and flashing as specified','Manto y flashing según especificación','sf','material','repairAreaSf'),
    t('roof_finish_material','roofing','Materials','Compatible replacement roof covering','Material compatible de techo','sf','material','repairAreaSf'),
    t('install_roof_patch','roofing','Installation','Install roof repair and seal transitions','Instalar reparación y sellar uniones','sf','labor','repairAreaSf'),
    t('roof_cleanup','roofing','Closeout','Remove roofing debris from work area','Retirar residuos del techo','job','labor','one')
  ]},
  {id:'electrical_branch',trade:'electrical',en:'Dedicated electrical circuit',es:'Circuito eléctrico dedicado',keywords:/circuit|circuito|outlet|tomacorriente|receptacle|gfci/i,
   facts:['routeFt'],tasks:[
    t('branch_assess','electrical','Preparation','Verify scope, load and circuit requirements','Verificar carga y requisitos del circuito','job','labor','one'),
    t('branch_route_material','electrical','Materials','Cable/conduit and fittings for planned route','Cable/tubo y accesorios para recorrido','lf','material','routeFt'),
    t('branch_install_labor','electrical','Installation','Install specified circuit route','Instalar recorrido del circuito','lf','labor','routeFt'),
    t('branch_device_material','electrical','Materials','Specified outlet/device and compatible breaker','Dispositivo y breaker compatible','ea','material','devices'),
    t('branch_termination_test','electrical','Closeout','Terminate, label and test circuit','Conectar, identificar y probar circuito','job','labor','one'),
    t('branch_wall_patch','drywall','Optional','Patch wall openings after electrical access','Resanar aperturas de pared','sf','labor','patchAreaSf',{condition:'patchWall',mode:'opt_in',capability:'wall_repair'})
  ]},
  {id:'panel_upgrade',trade:'electrical',en:'Main service panel replacement',es:'Reemplazo de panel principal',keywords:/panel|tablero|load\s*center/i,
   facts:['existingCircuits','newServiceAmps'],tasks:[
    t('service_review','electrical','Preparation','Review service requirements, utility and permit','Revisar servicio, utilidad y permiso','job','labor','one'),
    t('identify_circuits','electrical','Preparation','Identify and label existing circuits','Identificar circuitos existentes','ea','labor','existingCircuits'),
    t('remove_old_panel','electrical','Removal','Remove old panel under approved safe isolation','Retirar panel anterior con aislamiento seguro','job','labor','one'),
    t('panel_equipment','electrical','Materials','New panel and compatible equipment','Panel nuevo y equipo compatible','ea','material','one'),
    t('install_main_panel','electrical','Installation','Mount and install main panel and fittings','Montar panel y accesorios','job','labor','one'),
    t('circuit_breakers','electrical','Materials','Required replacement breakers by type and rating','Breakers de reemplazo por tipo y capacidad','ea','material','existingCircuits'),
    t('reterminate_circuits','electrical','Connections','Re-terminate existing branch circuits','Reconectar circuitos existentes','ea','labor','existingCircuits'),
    t('test_main_panel','electrical','Closeout','Arrange required checks, testing and inspection','Coordinar pruebas e inspección','job','labor','one'),
    t('panel_wall_patch','drywall','Optional','Patch disturbed interior wall','Resanar pared interior','sf','labor','patchAreaSf',{condition:'patchWall',mode:'opt_in',capability:'wall_repair'}),
    t('panel_stucco_patch','stucco','Optional','Patch disturbed exterior stucco','Resanar estuco exterior','sf','labor','stuccoAreaSf',{condition:'patchStucco',mode:'opt_in',capability:'stucco_repair'})
  ]}
]);
const BY_ASSEMBLY=new Map(ASSEMBLIES.map(x=>[x.id,x]));
const byTrade=trade=>ASSEMBLIES.filter(x=>x.trade===trade);
export function createProfile({primaryTrade,additionalTrades=[],capabilities=[],name=''}={}) {
  if(!IDS.has(primaryTrade))throw new Error('Select a valid primary trade');
  if(!Array.isArray(additionalTrades)||!Array.isArray(capabilities))throw new Error('Invalid profile selections');
  for(const x of additionalTrades)if(!IDS.has(x))throw new Error('Unknown trade: '+x);
  for(const x of capabilities)if(!VALID_CAPS.has(x))throw new Error('Unknown capability: '+x);
  return {schemaVersion:1,name:String(name).slice(0,120),primaryTrade,
    enabledTrades:unique([primaryTrade,...additionalTrades]),capabilities:unique(capabilities)};
}
export function visibleTrades(profile) {
  if(!profile)return [];
  const allowed=new Set(profile.enabledTrades||[]);
  return TRADES.filter(x=>allowed.has(x.id));
}
export function availableAssemblies(profile) {
  const allowed=new Set(visibleTrades(profile).map(x=>x.id));
  return ASSEMBLIES.filter(x=>allowed.has(x.trade));
}
export function identifyAssembly(profile,description,preferredTrade) {
  const candidates=availableAssemblies(profile).filter(x=>!preferredTrade||x.trade===preferredTrade);
  const matches=candidates.filter(x=>x.keywords.test(String(description||'')));
  // Ambiguity must be resolved by contractor, never guessed away.
  return matches.length===1?matches[0]:null;
}
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
function measure(key,values) {
  const n=k=>positive(Number(values[k]));
  if(key==='one')return 1;
  if(key==='slabAreaSf')return n('lengthFt')&&n('widthFt')?Number((n('lengthFt')*n('widthFt')).toFixed(3)):null;
  if(key==='slabPerimeterFt')return n('lengthFt')&&n('widthFt')?2*(n('lengthFt')+n('widthFt')):null;
  if(key==='slabVolumeYd3')return n('lengthFt')&&n('widthFt')&&n('depthIn')?Number((n('lengthFt')*n('widthFt')*n('depthIn')/324).toFixed(3)):null;
  if(key==='tileOrderSf')return n('floorAreaSf')?Number((n('floorAreaSf')*(1+(Number(values.wastePct)||0)/100)).toFixed(2)):null;
  if(key==='paintGallons')return n('wallAreaSf')&&n('coats')&&n('coverageSfPerGal')?Math.ceil(n('wallAreaSf')*n('coats')/n('coverageSfPerGal')):null;
  return n(key);
}
function allowedTask(profile,task) {
  const trades=new Set(profile.enabledTrades||[]);
  if(task.capability && !(profile.capabilities||[]).includes(task.capability))return false;
  // A contractor may explicitly opt into a named cross-trade capability.
  if(trades.has(task.trade))return true;
  return Boolean(task.capability && (profile.capabilities||[]).includes(task.capability));
}
const FIELD_LABELS={
 wallAreaSf:'Wall area (sq ft)',ceilingAreaSf:'Ceiling area (sq ft)',floorAreaSf:'Floor area (sq ft)',
 lengthFt:'Length (ft)',widthFt:'Width (ft)',depthIn:'Slab depth (in)',routeFt:'Circuit route (ft)',
 fixtures:'Number of fixtures',bathrooms:'Number of bathrooms',patchAreaSf:'Wall patch area (sq ft)',
 stuccoAreaSf:'Stucco patch area (sq ft)',petAreaSf:'Pet-waste area (sq ft)',
 patioAreaSf:'Outdoor cleaning area (sq ft)',baseboardLf:'Baseboard length (ft)',
 repairAreaSf:'Roof repair area (sq ft)',existingCircuits:'Existing circuits',
 newServiceAmps:'New service rating (A)',devices:'Number of electrical devices',
 excavationYd3:'Excavation to haul (yd3)',coats:'Coats of paint',coverageSfPerGal:'Coverage (sq ft/gallon)'
};
export const INPUT_LABELS=Object.freeze(FIELD_LABELS);
export function expandAssembly({profile,assemblyId,values={},choices={}}) {
  const assembly=BY_ASSEMBLY.get(assemblyId);
  if(!assembly)throw new Error('Unknown assembly');
  if(!availableAssemblies(profile).some(x=>x.id===assemblyId))throw new Error('Assembly not available to this trade profile');
  const tasks=[],exclusions=[],questions=[],futureWork=[],missingFields=new Set();
  for(const item of assembly.tasks) {
    const isOptional=item.mode==='opt_in';
    const selected=isOptional?choices[item.condition]===true:true;
    const requestedButNotAllowed=selected&&!allowedTask(profile,item);
    if(!selected||requestedButNotAllowed) {
      if(isOptional && (requestedButNotAllowed || choices[item.condition]===false))
        exclusions.push({id:item.id,reason:requestedButNotAllowed?'outside_contractor_scope':'declined',description_en:item.en,description_es:item.es});
      continue;
    }
    const quantity=measure(item.measure,values);
    if(quantity===null) {
      missingFields.add(item.measure);
      questions.push({id:item.measure,taskId:item.id,question:'Confirm '+(FIELD_LABELS[item.measure]||item.measure),reason:'missing_measurement'});
    }
    const included={code:item.id,trade:item.trade,phase:item.phase,description_en:item.en,description_es:item.es,
      quantity,unit:item.unit,costType:item.costType,status:quantity===null?'allowance_to_confirm':'included_now',
      dependsOn:[],source:'assembly',priceRequired:true};
    tasks.push(included);
  }
  const uniqueQuestions=unique(questions.map(x=>x.id)).map(id=>questions.find(x=>x.id===id));
  if(assembly.id==='panel_upgrade' && !positive(Number(values.newServiceAmps)))uniqueQuestions.push({id:'newServiceAmps',question:'Confirm new service rating (A)',reason:'missing_specification'});
  if(assembly.id==='room_painting'&&(!positive(Number(values.coats))||!positive(Number(values.coverageSfPerGal)))){
    for(const id of ['coats','coverageSfPerGal'])if(!positive(Number(values[id])))uniqueQuestions.push({id,question:'Confirm '+FIELD_LABELS[id],reason:'missing_specification'});
  }
  if(assembly.id==='concrete_slab')futureWork.push('Confirm reinforcement, mix, access and soil/base specification before final quote.');
  if(assembly.id==='panel_upgrade')futureWork.push('Verify load calculation, compatibility, service coordination, permits and code compliance before quoting.');
  if(assembly.id==='roof_patch')futureWork.push('Confirm roof material, access and concealed damage limits before quoting.');
  return {version:1,profileTrade:profile.primaryTrade,trade:assembly.trade,assemblyId,assemblyName:assembly.en,
    tasks,exclusions,questions:uniqueQuestions,futureWork,inputs:{...values},choices:{...choices},
    readyForPricing:tasks.length>0&&uniqueQuestions.length===0};
}
/** Convert the expanded task plan into the generic, existing estimator schema. */
export function toEstimatingJob(plan) {
  return {version:1,trade:plan.trade,kind:plan.assemblyId,attributes:{},tasks:plan.tasks,
    excludedWork:plan.exclusions.map(x=>x.description_en),futureWork:plan.futureWork,
    unknownDetails:plan.questions.map(x=>x.question)};
}
/** Used only for user-selected presentation. It is NOT authorization or billing access control. */
export function profileCanSeeJob(profile,job) {
  const projectTrades={bathroom:'remodel',kitchen:'remodel',adu:'remodel',turnover:'remodel',other:'remodel'};
  return visibleTrades(profile).some(t=>t.id===(projectTrades[job]||job));
}
