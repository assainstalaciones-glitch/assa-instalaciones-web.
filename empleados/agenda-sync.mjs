// Agenda outbox V1: immutable change intents, never a claim that Calendar was updated.
// The Portal can write intents to Airtable; an authorized Calendar reconciler
// must separately act and read back the result before marking them synchronized.
import { createHash } from 'node:crypto';

const TYPES = Object.freeze({
  create:'Alta de visita',
  schedule:'Cambio de horario',
  cancel:'Cancelación de visita',
  restore:'Recuperación'
});
const RECORD = /^rec[A-Za-z0-9]{14}$/;

export function makeAgendaIntent({jobId,action,before=null,after=null,operationId='',by='administracion',at=new Date().toISOString()}){
  if(!RECORD.test(jobId)||!Object.hasOwn(TYPES,action))throw Error('Referencia o acción de agenda inválida');
  if(!Number.isFinite(Date.parse(at)))throw Error('Fecha de origen inválida');
  const material = operationId||createHash('sha256')
    .update(JSON.stringify({jobId,action,before,after,at})).digest('hex').slice(0,28);
  if(!/^[\w-]{8,100}$/.test(material))throw Error('Identificador de operación inválido');
  const key=`portal:${jobId}:${action}:${material}`;
  return {id:'agenda-sync-'+material,kind:'calendar-sync-intent',state:'pending',
    key,jobId,action,at,by:String(by).slice(0,100),before,after};
}

export function agendaLedgerFields(intent){
  if(!intent||!RECORD.test(intent.jobId)||!Object.hasOwn(TYPES,intent.action)||!intent.key?.startsWith('portal:'))
    throw Error('Intención de agenda no válida');
  return {
    'Clave de operación':intent.key,
    'Trabajo':[intent.jobId],
    'Tipo de cambio':TYPES[intent.action],
    'Origen':'Portal ASSA',
    'Estado':'Pendiente de verificar',
    'Fecha del cambio':intent.at,
    'Antes':intent.before==null?'':JSON.stringify(intent.before),
    'Después':intent.after==null?'':JSON.stringify(intent.after),
    'Responsable':intent.by
  };
}

export function calendarJobMarker(jobId){
  if(!RECORD.test(jobId))throw Error('Trabajo inválido');
  return `[ASSA-TRABAJO:${jobId}]`;
}

export function calendarBelongsToJob(event,jobId){
  if(!RECORD.test(jobId)||!event)return false;
  return event.extendedProperties?.private?.assaJobId===jobId ||
    String(event.description||'').includes(calendarJobMarker(jobId));
}

// Produces a guarded PLAN, not a Calendar write.
// A name, date or title match alone is never sufficient to select an event.
export function planCalendarAction(intent,events){
  if(!intent||!RECORD.test(intent.jobId)||!Object.hasOwn(TYPES,intent.action))
    return {kind:'block',reason:'Intención inválida'};
  if(!Array.isArray(events))return {kind:'block',reason:'Calendario no consultado'};
  const candidates=events.filter(e=>calendarBelongsToJob(e,intent.jobId));
  if(candidates.length>1)return {kind:'block',reason:'Más de un evento vinculado; conciliación manual'};
  const event=candidates[0];
  if(!event)return {kind:'review',reason:'No existe ID/etiqueta inequívoca en Calendar; no crear duplicados ni borrar por nombre'};
  if(!event.id)return {kind:'block',reason:'Evento vinculado sin ID de proveedor'};
  const cancelled=event.status==='cancelled'||event.status==='canceled';
  if(intent.action==='cancel')return cancelled?
    {kind:'already-done',eventId:event.id}:{kind:'cancel',eventId:event.id,requiresReadback:true};
  if(cancelled)return {kind:'review',eventId:event.id,reason:'Calendar está cancelado; no reactivar sin comprobación explícita'};
  if(intent.action==='restore')return {kind:'review',eventId:event.id,reason:'Recuperación requiere revisión de nueva disponibilidad'};
  return {kind:'update',eventId:event.id,requiresReadback:true};
}
