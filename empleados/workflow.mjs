// Versioned audit events live in existing OT internal notes. Old orders are never migrated.
export const REVIEW_PREFIX = 'PORTAL-REVISION-V1:';
export function reviewEvent(order) {
  const lines=String(order.fields?.['Notas internas']||'').split('\n');
  for(const line of lines.reverse())if(line.startsWith(REVIEW_PREFIX)){
    try{return JSON.parse(line.slice(REVIEW_PREFIX.length));}catch{return null;}
  }
  return null;
}
export function appendReview(notes,event){return String(notes||'')+'\n'+REVIEW_PREFIX+JSON.stringify(event);}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function scheduleSnapshot(fields){return {date:fields['Fecha prevista']||'',assigned:fields['Operarios asignados portal']||'',start:fields['Hora inicio prevista (portal)']||'',end:fields['Hora fin prevista (portal)']||''};}
export function executionSummary(records){
  return {user:[...new Set(records.map(r=>r.fields['Usuario operario']))].join(', '),
    hours:records.reduce((n,r)=>n+Number(r.fields['Horas reales']||0),0),
    material:records.map(r=>r.fields['Usuario operario']+' · '+(r.fields['Fecha trabajo']||'Fecha sin indicar')+': '+(r.fields['Material utilizado']||'Sin material')).join('\n'),
    notes:records.map(r=>r.fields['Usuario operario']+' · '+(r.fields['Fecha trabajo']||'Fecha sin indicar')+': '+(r.fields.Observaciones||'Sin observaciones')).join('\n')};
}

