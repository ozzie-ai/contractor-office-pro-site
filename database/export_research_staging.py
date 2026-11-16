"""Read-only, evidence-conservative export of the owner's residential research catalog.

No credentials, no client records, no selling-rate promotion, no cloud writes.
The generated SQL targets the RLS-protected reference catalog only.
"""
import sqlite3, json, decimal, pathlib, re, argparse
from datetime import date
cols=['reference_id','reference_kind','trade','service','unit','locality','low_usd','high_usd','planning_rate_usd','cost_basis','scope','exclusions','evidence_note','checked_on','recheck_on','review_status','budget_usable','automatic_final_quote']
def cents(x):
 try:
  if x is None: return None
  d=decimal.Decimal(str(x))
  if not d.is_finite() or d<0 or d>10000000: return None
  return format(d.quantize(decimal.Decimal('.01'),rounding=decimal.ROUND_HALF_UP),'f')
 except: return None
def ds(x):
 try:
  if x is None: return None
  s=str(x).strip()
  if re.fullmatch(r'\d{4}-\d{2}-\d{2}',s): date.fromisoformat(s);return s
  return None
 except: return None
def clean(x,maxlen=600):
 if x is None: return None
 return ''.join(ch for ch in str(x).strip() if ch=='\n' or ch=='\t' or ord(ch)>=32)[:maxlen] or None
def quote(x):
 if x is None: return 'NULL'
 if x is True: return 'TRUE'
 if x is False: return 'FALSE'
 return "'"+str(x).replace("'","''")+"'"
def export_research(src: pathlib.Path, out: pathlib.Path, batch_size: int = 60) -> dict:
    if not src.is_file(): raise FileNotFoundError(str(src))
    if not 1<=batch_size<=100: raise ValueError("Batch size must be 1..100")
    rows=[];skips={}
    con=sqlite3.connect(src.resolve().as_uri()+'?mode=ro',uri=True)
    con.row_factory=sqlite3.Row
    required={'cop_service_pricebook','cop_supplier_price_references','approved_unit_rates'}
    found={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    if not required.issubset(found): raise ValueError("Required pricing tables are missing")
    for r in con.execute('select * from cop_service_pricebook order by trade,service,locality,id'):
     low,high,rate=cents(r['low']),cents(r['high']),cents(r['planning_rate'])
     if not ((low is not None and high is not None and decimal.Decimal(low)<=decimal.Decimal(high)) or rate is not None):
      skips['service_no_price']=skips.get('service_no_price',0)+1
     if low and high and decimal.Decimal(low)>decimal.Decimal(high):low=high=None
     if not all([clean(r[x]) for x in ('id','trade','service','unit')]):
      skips['service_required']=skips.get('service_required',0)+1;continue
     usable=bool(r['budget_usable']) and ((low is not None and high is not None and decimal.Decimal(low)<=decimal.Decimal(high)) or rate is not None)
     values=['service:'+r['id'],'service_market',clean(r['trade']),clean(r['service']),clean(r['unit']),clean(r['locality']) or '',low,high,rate,clean(r['cost_basis']),clean(r['scope'],1200),clean(r['exclusions'],1200),clean('Model: '+str(r['method'] or 'not supplied')+'; source status: '+str(r['status'] or 'unknown'),500),ds(r['checked_date']),None,'market_reference' if usable else 'reference_only',usable,False]
     rows.append(values)
    for r in con.execute('select * from cop_supplier_price_references order by service,locality,id'):
     low,high=cents(r['low']),cents(r['high'])
     if low is None or high is None or decimal.Decimal(low)>decimal.Decimal(high) or str(r['currency'] or '').upper()!='USD':
      skips['supplier_invalid_range']=skips.get('supplier_invalid_range',0)+1
      low=high=None
     if not all([clean(r[x]) for x in ('id','service','unit')]):
      skips['supplier_required']=skips.get('supplier_required',0)+1;continue
     values=['supplier:'+r['id'],'supplier_market','Equipment and suppliers',clean(r['service']),clean(r['unit']),clean(r['locality']) or '',low,high,None,clean(r['price_kind']),clean('Reference rate type: '+str(r['price_kind'] or 'not established')+'; scope and inclusions require contractor verification.'),clean('Delivery, taxes, labor, equipment operator, fuel, damage waiver and minimums may be extra.'),clean('Supplier evidence status: '+str(r['review_status'] or 'unknown'),250),ds(r['checked_date']),None,'reference_only',False,False]
     rows.append(values)
    # Validate stable primary key, no preapproval, valid expected counts.
    assert len({r[0] for r in rows})==len(rows)
    assert all(x[-1] is False for x in rows)
    assert all(x[1] != 'reviewed_budget' for x in rows)
    manifest={'source':'Contractor_Office_Pro_Residential_Data.sqlite','service_records':sum(x[1]=='service_market' for x in rows),'supplier_records':sum(x[1]=='supplier_market' for x in rows),'total_rows':len(rows),'skips':skips,'budget_usable_service_refs':sum(x[1]=='service_market' and x[-2] is True for x in rows),'auto_final_selling_rates':0,'approved_unit_rates':con.execute('select count(*) from approved_unit_rates').fetchone()[0],'kind':'read_only_research_catalog_import','not_customer_quote':True}
    out.mkdir(parents=True,exist_ok=True)
    for i,start in enumerate(range(0,len(rows),batch_size),1):
     batch=rows[start:start+batch_size]
     pre="-- PRIVATE CONTRACTOR OFFICE PRO RESEARCH-ONLY IMPORT. Never a final selling-price catalog.\n"
     pre+="INSERT INTO public.cop_research_references ("+','.join(cols)+") VALUES\n"
     pre+=',\n'.join('('+','.join(quote(v) for v in row)+')' for row in batch)+'\nON CONFLICT (reference_id) DO NOTHING;\n'
     (out/f'cop_research_batch_{i:02}.sql').write_text(pre,encoding='utf-8')
    manifest['batches']=len(list(out.glob('cop_research_batch_*.sql')))
    manifest['batch_file_bytes']={f.name:f.stat().st_size for f in sorted(out.glob('*.sql'))}
    (out/'cop_research_import_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    con.close()
    return manifest


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=pathlib.Path,required=True)
    parser.add_argument('--out-dir',type=pathlib.Path,required=True)
    parser.add_argument('--batch-size',type=int,default=60)
    args=parser.parse_args()
    print(json.dumps(export_research(args.db,args.out_dir,args.batch_size),indent=2))