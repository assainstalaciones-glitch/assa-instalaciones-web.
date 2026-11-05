import {INSTALLATION_MODE,INSTALLATION_FIELDS as I} from './public/partner-installations.js';
import {REL_FIELDS as R} from './public/relationships.js';
import {OUTCOMES,OUTCOME_FIELD} from './public/outcomes.js';
import {reviewEvent,validDate} from './workflow.mjs';
import {readAudit} from './direction-edit.mjs';
export function partnerSummary(jobs,orders,{from,to,partnerId=''}){
 if(!validDate(from)||!validDate(to)||from>to)throw Object.assign(new Error('Indica un intervalo de fechas válido.'),{status:400});
 const inRange=d=>validDate(d||'')&&d>=from&&d<=to;
 const rows=[],undated=[];
 for(const job of jobs){
  const f=job.fields;if(f[I.mode]!==INSTALLATION_MODE||(partnerId&&(partnerId==='other'?!!f[R.partnerId]?.length:!f[R.partnerId]?.includes(partnerId))))continue;
  const related=orders.filter(o=>o.fields['Trabajo origen']?.includes(job.id));
  const approved=related.some(o=>o.fields['Estado parte']==='Firmado / archivado'&&o.fields['Parte firmado']?.length&&reviewEvent(o)?.state==='approved')||readAudit(job).some(e=>e.kind==='outcome'&&e.code==='completed'&&e.state==='approved'&&e.reviewedBy);
  const pending=related.some(o=>o.fields['Estado parte']==='Firmado / archivado'&&o.fields['Parte firmado']?.length&&reviewEvent(o)?.state==='pending');
  const outcome=OUTCOMES.find(o=>o.label===f[OUTCOME_FIELD]),notDone=['Cancelado','No aceptado / Sin respuesta'].includes(f.Estado)||(outcome?.closed&&outcome.code!=='completed');
  const closed=['Terminado','Facturado','Pendiente de cobro'].includes(f.Estado)||outcome?.code==='completed';
  const units=Number.isInteger(f[I.units])&&f[I.units]>0&&f[I.units]<=100?f[I.units]:null;
  const row={id:job.id,reference:f['Trabajo / referencia']||'',partnerId:f[R.partnerId]?.[0]||'',partner:f[R.partnerName]||'',address:f.Dirección||'',plannedOn:f['Fecha prevista']||'',executedOn:f[I.executedOn]||'',units,status:f.Estado||'',invoiceRef:f['Ref. factura']||'',outcome:f[OUTCOME_FIELD]||''};
  if(notDone){if(inRange(row.plannedOn))rows.push({...row,category:'notDone',label:'No realizada / desistida'});continue;}
  if(closed&&approved){if(!validDate(row.executedOn)){undated.push({...row,label:'Fecha de ejecución por confirmar'});continue;}if(inRange(row.executedOn))rows.push({...row,category:units===null||!row.partnerId?'review':'completed',label:!row.partnerId?'Realizada · colaborador y facturación por confirmar':units===null?'Unidades por confirmar':row.invoiceRef?'Realizada · con referencia de factura':'Realizada · para preparar factura'});continue;}
  if(inRange(row.plannedOn)||inRange(row.executedOn))rows.push({...row,category:pending||closed?'review':'planned',label:pending||closed?'Pendiente de revisión de dirección':'Programada · aún no realizada'});
 }
 rows.sort((a,b)=>(a.executedOn||a.plannedOn).localeCompare(b.executedOn||b.plannedOn)||a.partner.localeCompare(b.partner));
 const count=kind=>rows.filter(r=>r.category===kind).length,sum=predicate=>rows.filter(predicate).reduce((n,r)=>n+(r.units||0),0);
 return {from,to,rows,undated,counts:{completedJobs:count('completed'),completedUnits:sum(r=>r.category==='completed'),toPrepareUnits:sum(r=>r.category==='completed'&&!r.invoiceRef),withInvoiceUnits:sum(r=>r.category==='completed'&&!!r.invoiceRef),plannedJobs:count('planned'),reviewJobs:count('review'),notDoneJobs:count('notDone'),undatedJobs:undated.length}};
}
