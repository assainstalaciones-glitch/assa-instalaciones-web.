import { isTestRecord } from './admin-dashboard.mjs';
export const LEDGER_FIELDS=['Concepto','Tipo','Fecha movimiento','Base sin IVA','IVA importe','Total con IVA','Referencia documento','Tercero','Trabajo ID','Gasto fijo ID','Periodo fijo','Evidencia','Estado','Operación ID','Creado por','Fecha registro'];
export const FIXED_FIELDS=['Concepto','Coste mensual equivalente','Estado','Incluir en punto equilibrio','Notas'];
const cents=n=>Math.round(n*100);
const amount=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000000;
export function realDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
const next=s=>new Date(Date.parse(s+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const daysIn=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),0)).getUTCDate();
const label=f=>String(f['Concepto']||'Sin concepto');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function validateMovement(b,today){
 if(!['Cobro','Gasto'].includes(b.type)||!realDate(b.date)||b.date>today)fail('Indica un tipo y una fecha real no futura.');
 for(const key of ['concept','party','reference','evidence'])if(typeof b[key]!=='string'||!b[key].trim()||b[key].length>2000)fail('Completa concepto, tercero, referencia y evidencia.');
 if(!amount(b.base)||!amount(b.vat)||!amount(b.total)||b.total<=0||Math.abs(cents(b.base)+cents(b.vat)-cents(b.total))>1)fail('Base e IVA deben sumar el importe total del movimiento.');
 if(!/^[a-f0-9-]{36}$/.test(b.operationId||''))fail('Identificador de operación inválido.');
 if(b.jobId&&!/^rec[A-Za-z0-9]{14}$/.test(b.jobId))fail('Trabajo inválido.');
 if(b.fixedId){
  if(b.type!=='Gasto'||!/^rec[A-Za-z0-9]{14}$/.test(b.fixedId)||!realDate(b.fixedMonth+'-01')||b.fixedMonth>today.slice(0,7))fail('Revisa el gasto fijo y su mes.');
 }else if(b.fixedMonth)fail('Selecciona el concepto fijo al indicar un mes.');
 return {'Concepto':b.concept.trim(),'Tipo':b.type,'Fecha movimiento':b.date,'Base sin IVA':b.base,'IVA importe':b.vat,'Total con IVA':b.total,'Referencia documento':b.reference.trim(),'Tercero':b.party.trim(),'Trabajo ID':b.jobId||'','Gasto fijo ID':b.fixedId||'','Periodo fijo':b.fixedMonth||'','Evidencia':b.evidence.trim(),'Estado':'Confirmado','Operación ID':b.operationId};
}
const canonical=s=>String(s||'').trim().toLocaleLowerCase('es').replace(/\s+/g,' ');
export function duplicateKey(f){
 const invoice=[f['Tipo'],canonical(f['Tercero']),canonical(f['Referencia documento'])];
 return JSON.stringify(f['Tipo']==='Gasto'?invoice:[...invoice,f['Fecha movimiento'],cents(f['Total con IVA'])]);
}
export function buildFinance(movements,fixed,jobs,{from,to,group='month',today}){
 if(!realDate(from)||!realDate(to)||from>to||to>today||!['day','week','month'].includes(group)||Date.parse(to)-Date.parse(from)>366*86400000)fail('Selecciona fechas válidas, hasta hoy y un máximo de 367 días.');
 const warnings=[],rows=[],valid=[],seen=new Set(),keys=new Map(),ops=new Map(),slots=new Map();
 const fixedMap=new Map(fixed.map(x=>[x.id,x]));
 const jobMap=new Map(jobs.map(x=>[x.id,x]));
 const active=movements.filter(x=>x.fields?.Estado!=='Anulado');
 for(const r of active){const f=r.fields||{};if(f.Estado!=='Confirmado'){warnings.push({id:r.id,concept:label(f),reason:'Movimiento pendiente de validar; excluido'});continue;}
  let ok=true;try{validateMovement({type:f.Tipo,date:f['Fecha movimiento'],base:f['Base sin IVA'],vat:f['IVA importe'],total:f['Total con IVA'],concept:f.Concepto,party:f.Tercero,reference:f['Referencia documento'],evidence:f.Evidencia,operationId:f['Operación ID'],jobId:f['Trabajo ID'],fixedId:f['Gasto fijo ID'],fixedMonth:f['Periodo fijo']},today);}catch{ok=false;}
  if(f['Trabajo ID']&&(!jobMap.has(f['Trabajo ID'])||isTestRecord(jobMap.get(f['Trabajo ID']).fields)))ok=false;
  if(f['Gasto fijo ID']&&!fixedMap.has(f['Gasto fijo ID']))ok=false;
  if(!ok){warnings.push({id:r.id,concept:label(f),reason:'Datos incompletos, referencia inexistente o prueba; excluido'});continue;}
  valid.push(r);const key=duplicateKey(f);keys.set(key,[...(keys.get(key)||[]),r.id]);const op=f['Operación ID'];ops.set(op,[...(ops.get(op)||[]),r.id]);
  if(f['Gasto fijo ID']){const slot=f['Gasto fijo ID']+'|'+f['Periodo fijo'];slots.set(slot,[...(slots.get(slot)||[]),r.id]);}
 }
 const rejected=new Set([...keys.values(),...ops.values(),...slots.values()].filter(a=>a.length>1).flat());
 const events=[],paidByJob=new Map();
 for(const r of valid){const f=r.fields;if(rejected.has(r.id)){warnings.push({id:r.id,concept:label(f),reason:'Posible duplicado; excluido hasta revisión'});continue;}
  if(f.Tipo==='Cobro'&&f['Trabajo ID'])paidByJob.set(f['Trabajo ID'],(paidByJob.get(f['Trabajo ID'])||0)+cents(f['Total con IVA']));
  if(f['Gasto fijo ID'])continue;
  if(f['Fecha movimiento']>=from&&f['Fecha movimiento']<=to)events.push({id:r.id,date:f['Fecha movimiento'],concept:label(f),type:f.Tipo,base:cents(f['Base sin IVA']),vat:cents(f['IVA importe']),total:cents(f['Total con IVA']),estimated:false,reference:f['Referencia documento']});
 }
 // Estado de cobros por trabajo: vista histórica (IVA incluido) separada del flujo por fechas.
 // No convertir fecha de ejecución o confirmación en fecha bancaria.
 const crmPaid=[],crmPending=[];let missingPaymentDates=0;
 const proposalStatuses=new Set(['Pendiente de visita','Presupuesto pendiente','Presupuesto enviado','Aceptado / Programado','No aceptado / Sin respuesta','Cancelado']);
 for(const j of jobs){
  const f=j.fields||{},status=String(f['Estado']||''),paymentStatus=String(f['Estado cobro']||'');
  if(isTestRecord(f)||status==='Cancelado'||status==='No aceptado / Sin respuesta')continue;
  const paid=amount(f['Importe cobrado'])?cents(f['Importe cobrado']):0;
  const total=amount(f['Importe total'])?cents(f['Importe total']):null;
  const entered=paidByJob.get(j.id)||0;
  const concept=f['Trabajo / referencia']||j.id,invoice=String(f['Ref. factura']||'').trim();
  if(paid>0){
   crmPaid.push({id:j.id,concept,invoice,paid:paid/100,remaining:total===null?null:Math.max(0,total-paid)/100,partial:total!==null&&paid<total});
   if(paid>entered)missingPaymentDates++;
  }
  // Deuda real sólo si hay factura y estado de cobro/trabajo pertinente; nunca presupuestos no ejecutados.
  const due=total!==null&&total>paid&&!!invoice&&(
   status==='Pendiente de cobro'||status==='Facturado'||
   (['Pendiente','Parcial'].includes(paymentStatus)&&!proposalStatuses.has(status)));
  if(due)crmPending.push({id:j.id,concept,invoice,paid:paid/100,remaining:(total-paid)/100,status:paid>0?'Parcial':'Pendiente'});
  if(entered>paid)warnings.push({id:j.id,concept,reason:'Los movimientos fechados superan el importe cobrado de la ficha; conciliar.'});
  if(total!==null&&paid>total)warnings.push({id:j.id,concept,reason:'El importe cobrado supera el total del trabajo; revisar.'});
  if(paymentStatus==='Cobrado'&&paid===0&&total>0)warnings.push({id:j.id,concept,reason:'Estado Cobrado sin importe cobrado; revisar.'});
 }
 crmPaid.sort((a,b)=>b.paid-a.paid);crmPending.sort((a,b)=>b.remaining-a.remaining);
 const months=new Set();for(let d=from;d<=to;d=next(d))months.add(d.slice(0,7));
 for(const x of fixed){const f=x.fields||{};if(!f['Incluir en punto equilibrio'])continue;
  for(const month of months){
   const ids=slots.get(x.id+'|'+month)||[];const actual=ids.length===1&&!rejected.has(ids[0])?valid.find(r=>r.id===ids[0]):null;
   if(!actual&&(!amount(f['Coste mensual equivalente'])||f.Estado==='Falta importe')){warnings.push({id:x.id,concept:label(f),reason:'Falta importe fijo para '+month});continue;}
   const monthly=cents(actual?actual.fields['Base sin IVA']:f['Coste mensual equivalente']),n=daysIn(month);
   // Cumulative rounding makes daily amounts add up exactly to the month.
   for(let day=1;day<=n;day++){const date=month+'-'+String(day).padStart(2,'0');if(date<from||date>to)continue;
    events.push({id:actual?.id||x.id,date,concept:label(f),type:'Gasto',base:Math.round(monthly*day/n)-Math.round(monthly*(day-1)/n),vat:null,total:null,estimated:!actual,reference:actual?.fields['Referencia documento']||'Previsión mensual prorrateada'});
   }
  }
 }
 const buckets=new Map();
 function bucket(date){if(group==='day')return date;if(group==='month')return date.slice(0,7);const dt=new Date(date+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()-((dt.getUTCDay()+6)%7));return dt.toISOString().slice(0,10);}
 for(let d=from;d<=to;d=next(d)){const key=bucket(d);if(!buckets.has(key))buckets.set(key,{period:key,collected:0,expenses:0,estimated:0,result:0});}
 for(const e of events){const b=buckets.get(bucket(e.date));if(e.type==='Cobro')b.collected+=e.base;else {b.expenses+=e.base;if(e.estimated)b.estimated+=e.base;}}
 for(const b of buckets.values()){b.result=b.collected-b.expenses;rows.push(Object.fromEntries(Object.entries(b).map(([k,v])=>[k,k==='period'?v:v/100])));}
 const sum=k=>Math.round(rows.reduce((s,r)=>s+cents(r[k]),0))/100;
 const uniqueWarnings=warnings.filter(w=>{const k=JSON.stringify(w);if(seen.has(k))return false;seen.add(k);return true;});
 return {from,to,group,rows,totals:{collected:sum('collected'),expenses:sum('expenses'),estimated:sum('estimated'),result:sum('result')},warnings:uniqueWarnings,
 crm:{paid:crmPaid,pending:crmPending,totals:{paid:Math.round(crmPaid.reduce((n,x)=>n+cents(x.paid),0))/100,pending:Math.round(crmPending.reduce((n,x)=>n+cents(x.remaining),0))/100},missingPaymentDates},
 events:events.filter(e=>!e.estimated).map(e=>({...e,base:e.base/100,vat:e.vat===null?null:e.vat/100,total:e.total===null?null:e.total/100})),
 fixedOptions:fixed.map(x=>({id:x.id,concept:label(x.fields),monthly:x.fields['Coste mensual equivalente']??null})),
 jobOptions:jobs.filter(j=>!isTestRecord(j.fields||{})&&(j.fields?.['Estado']||j.fields?.['Importe cobrado']>0)).map(j=>({id:j.id,concept:j.fields['Trabajo / referencia']||j.id})),
 notice:'Importes sin IVA. Resultado sobre cobros menos gastos registrados y previsiones fijas; no es beneficio contable ni saldo bancario. Las facturas de gasto se registran al recibirlas, aunque no estén pagadas. Cobros de trabajos sin fecha se presentan en el estado general, pero no se asignan al periodo. Las previsiones usan la ficha fija actual, no un histórico contable.'};
}
