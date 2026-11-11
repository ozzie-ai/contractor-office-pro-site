/** Contractor Office Pro: pure, shared estimating core. No DOM, network or customer storage. */
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const asText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const ampsIn = text => [...text.matchAll(/\b(\d{2,3})\s*(?:amperios?|amps?|a\b)/gi)].map(m => Number(m[1]));

function task(code, en, es, quantity, unit, costType, options = {}) {
  return { code, description_en: en, description_es: es, quantity, unit, costType,
    status: options.status || 'included_now', priceRequired: options.priceRequired ?? (costType !== 'scope'),
    ...(options.fixedPrice !== undefined ? { fixedPrice: options.fixedPrice } : {}) };
}

/** A conservative deterministic reference parser. AI output can use createJob instead. */
export function interpretPanelUpgrade(description) {
  const text = asText(description);
  if (!/(panel|tablero|service\s+equipment|load\s*center)/i.test(text) || !/(upgrade|reemplaz|replace|cambiar|change|convertir|moderniz)/i.test(text)) {
    throw new Error('panel_upgrade_not_recognized');
  }
  const ampValues = ampsIn(text);
  const transition = text.match(/\b(\d{2,3})\s*(?:amperios?|amps?|a\b)?\s*(?:a|to|hacia|→|por|with)\s*(?:uno?\s+(?:de\s+)?)?(\d{2,3})\s*(?:amperios?|amps?|a\b)/i);
  const oldAmps = transition ? Number(transition[1]) : ampValues[0] ?? null;
  const newAmps = transition ? Number(transition[2]) : ampValues[1] ?? null;
  if (!(oldAmps > 0 && newAmps > oldAmps)) throw new Error('service_ratings_need_review');

  const circuitMatch = text.match(/(?:transferir|transfer|mover|move|reubicar|migrate|reemplazar|replace|cambiar|change)[^.;]{0,95}?\b(\d+)\s*(?:de\s+los\s+)?(?:circuitos?|circuits?)/i)
    || text.match(/\b(\d+)\s+(?:de\s+los\s+)?(?:circuitos?|circuits?)\s+(?:existentes?|actuales?|existing|old)/i)
    || text.match(/(?:actualmente\s+tiene|currently\s+has|existing|existentes?)[^.;]{0,30}?\b(\d+)\s*(?:circuitos?|circuits?)/i)
    || text.match(/\b(\d+)\s+de\s+los\s+existentes?\s+circuitos?/i)
    || text.match(/(?:tiene|has)[^.;]{0,65}?\b(\d+)\s*(?:circuitos?|circuits?)/i);
  const existingCircuits = circuitMatch ? Number(circuitMatch[1]) : null;
  const permitMatch = text.match(/(?:permisos?|permits?)[^.;]{0,40}?\$\s*([\d,.]+)/i)
    || text.match(/\$\s*([\d,.]+)[^.;]{0,40}?(?:permisos?|permits?)/i);
  const permit = permitMatch ? Number(permitMatch[1].replace(/,/g, '')) : null;

  // Keep an EV circuit distinct from a future reserved breaker.
  const futureWords = /(?:futuro|future|posterior|despu[eé]s|later|pr[oó]ximo\s+trabajo|no\s+en\s+este)/i.test(text);
  const futureCandidates = [...text.matchAll(/(?:circuito|circuit|breaker|interruptor|feeder|alimentador)[^.;]{0,48}?(\d{2,3})\s*(?:amperios?|amps?|a\b)/gi)]
    .map(m => ({amps:Number(m[1]), index:m.index, end:m.index+m[0].length}));
  const candidates = futureCandidates.map(c => {
    const before=text.slice(Math.max(0,c.index-35),c.index);
    const after=text.slice(c.end,c.end+100);
    const nearby=before+' '+after;
    const futureMention=/(?:futuro|future|posterior|despu[eé]s|later|pr[oó]ximo|reservad|listo|ready|subpanel|su\s*panel|adu|otro|otra|another)/i.test(nearby);
    const evMention=/(?:cargador|charger|evse|veh[ií]culo\s+el[eé]ctrico)/i.test(nearby);
    return {...c,score:(futureMention?4:0)-(evMention?3:0)};
  });
  const possibleFuture = futureWords ? candidates.filter(c => c.score>0).sort((a,b)=>b.score-a.score || b.index-a.index)[0] : null;
  const futureAmps = possibleFuture?.amps ?? null;
  const noBreakerNow = /(?:no\s+(?:voy\s+a\s+)?(?:agregar|instalar|poner|incluir)[^.;]{0,28}?breakers?|sin\s+(?:el\s+)?breaker|no\s+breakers?|without\s+(?:a\s+)?breaker|breaker[^.;]{0,20}?not\s+installed)/i.test(text);
  const futureSegment = possibleFuture ? text.slice(Math.max(0,possibleFuture.index-28),possibleFuture.end+95) : '';
  const breakerNow = futureAmps !== null && !noBreakerNow && /(?:instalar|install|agregar|add|dejar|leave|poner|set)[^.;]{0,48}?(?:breaker|interruptor)|(?:breaker|interruptor)[^.;]{0,65}?(?:listo|ready|reservad|futuro|posterior)/i.test(futureSegment);
  const futureMode = futureAmps === null ? 'none' : noBreakerNow ? 'reserve_space' : breakerNow ? 'breaker_now' : 'needs_confirmation';
  const excludedWork = [];
  const futureWork = [];
  const unknownDetails = ['Confirm load calculation, utility requirements, equipment selection and code-compliant service design.',
    'Confirm existing breaker compatibility/reuse versus replacement.', 'Confirm grounding, bonding and utility coordination scope.'];
  const tasks = [
    task('main_panel_material', newAmps+'A main panel equipment', 'Equipo panel principal '+newAmps+'A', 1, 'ea', 'material'),
    task('panel_install_labor', 'Replace '+oldAmps+'A service panel with '+newAmps+'A panel — labor', 'Mano de obra cambio panel '+oldAmps+'A a '+newAmps+'A', 1, 'job', 'labor')
  ];
  if (existingCircuits !== null && existingCircuits > 0) {
    tasks.push(task('transfer_existing_circuits', 'Transfer and label existing circuits — labor', 'Transferir e identificar circuitos existentes — mano de obra', existingCircuits, 'ea', 'labor'));
  } else unknownDetails.push('Number of existing circuits to transfer.');
  if (permit !== null && numeric(permit) && permit >= 0) tasks.push(task('permit_allowance', 'Permit allowance', 'Asignación para permiso', 1, 'job', 'fee', { fixedPrice: permit }));
  else unknownDetails.push('Permit cost or allowance.');
  if (futureAmps !== null) {
    futureWork.push('Future '+futureAmps+'A feeder/circuit wiring and final connections are not included in this estimate.');
    if (futureMode === 'reserve_space') {
      tasks.push(task('future_circuit_space', 'Reserve position for future '+futureAmps+'A circuit (no breaker or wiring)', 'Reservar espacio para futuro circuito '+futureAmps+'A (sin breaker ni cable)', 1, 'scope', 'scope', { priceRequired: false }));
      excludedWork.push('Future '+futureAmps+'A breaker installation and feeder wiring.');
    } else if (futureMode === 'breaker_now') {
      tasks.push(task('future_breaker_material', 'Provide '+futureAmps+'A breaker for future connection', 'Proveer breaker '+futureAmps+'A para futura conexión', 1, 'ea', 'material'));
      tasks.push(task('future_breaker_install', 'Install '+futureAmps+'A breaker — no feeder connection', 'Instalar breaker '+futureAmps+'A sin conectar alimentador', 1, 'ea', 'labor'));
    } else {
      unknownDetails.push('Confirm whether to install '+futureAmps+'A breaker now or only reserve space.');
    }
  }
  if (futureAmps === null && futureWords) unknownDetails.push('Future circuit amperage and included work.');
  return createJob({ trade: 'electrical', kind: 'panel_upgrade', tasks, excludedWork, futureWork,
    unknownDetails, attributes: { oldAmps, newAmps, existingCircuits, futureAmps, futureMode, permit } });
}

/** Same task contract for electrical, painting, concrete, plumbing, remodeling, etc. */
export function createJob({ trade, kind = 'general', tasks = [], excludedWork = [], futureWork = [], unknownDetails = [], attributes = {} }) {
  if (!trade || !Array.isArray(tasks) || !tasks.length) throw new Error('job_requires_trade_and_tasks');
  const ids = new Set();
  const cleanTasks = tasks.map((t, index) => {
    if (!t.code || ids.has(t.code)) throw new Error('duplicate_or_missing_task_code_'+index);
    ids.add(t.code);
    if (!['material', 'labor', 'equipment', 'fee', 'subcontract', 'scope'].includes(t.costType)) throw new Error('invalid_cost_type_'+t.code);
    if (!['included_now', 'allowance_to_confirm', 'excluded', 'future'].includes(t.status)) throw new Error('invalid_status_'+t.code);
    if (t.status === 'included_now' && (!numeric(t.quantity) || t.quantity <= 0)) throw new Error('invalid_quantity_'+t.code);
    return { ...t };
  });
  return { version: 1, trade, kind, attributes: { ...attributes }, tasks: cleanTasks,
    excludedWork: [...excludedWork], futureWork: [...futureWork], unknownDetails: [...unknownDetails] };
}

/** No guessed catalog prices: unknown is null, never zero or a finished bid. */
export function priceEstimate(job, priceCatalog = {}, { overheadRate = 0, profitRate = 0 } = {}) {
  if (![overheadRate, profitRate].every(v => numeric(v) && v >= 0 && v <= 1)) throw new Error('invalid_markup_rate');
  const items = job.tasks.filter(t => ['included_now', 'allowance_to_confirm'].includes(t.status)).map(t => {
    const catalogValue = priceCatalog[t.code];
    const unitCost = t.fixedPrice !== undefined ? t.fixedPrice : (numeric(catalogValue) ? catalogValue : null);
    const mustPrice = t.priceRequired !== false && t.costType !== 'scope';
    if (unitCost !== null && (!numeric(unitCost) || unitCost < 0)) throw new Error('invalid_price_'+t.code);
    const extendedCost = unitCost === null ? null : money(t.quantity * unitCost);
    return { ...t, unitCost, extendedCost, missingPrice: mustPrice && unitCost === null };
  });
  const missingPrices = items.filter(t => t.missingPrice).map(t => t.code);
  const categoryTotals = Object.fromEntries(['material','labor','equipment','fee','subcontract'].map(k => [k, null]));
  for (const category of Object.keys(categoryTotals)) {
    const group = items.filter(x => x.costType === category && x.priceRequired !== false);
    categoryTotals[category] = group.some(x => x.extendedCost === null) ? null : money(group.reduce((a, x) => a + x.extendedCost, 0));
  }
  const complete = missingPrices.length === 0;
  const baseCost = complete ? money(items.reduce((sum, t) => sum + (t.extendedCost ?? 0), 0)) : null;
  const overhead = complete ? money(baseCost * overheadRate) : null;
  const profit = complete ? money((baseCost + overhead) * profitRate) : null;
  const total = complete ? money(baseCost + overhead + profit) : null;
  const blockers = [...missingPrices.map(code => 'Price missing: '+code), ...job.unknownDetails];
  const takeoff = items.filter(t => t.costType === 'material').map(t => ({code: t.code, description_en: t.description_en, quantity: t.quantity, unit: t.unit}));
  const proposal = { trade: job.trade, kind: job.kind,
    scope: items.map(({description_en, quantity, unit, status}) => ({description_en, quantity, unit, status})),
    excludedWork: [...job.excludedWork], futureWork: [...job.futureWork],
    total: blockers.length ? null : total, status: blockers.length ? 'draft_review_required' : 'priced_draft' };
  return { items, takeoff, totals: { ...categoryTotals, baseCost, overhead, profit, total },
    missingPrices, blockers, readyForReview: blockers.length === 0, proposal };
}
