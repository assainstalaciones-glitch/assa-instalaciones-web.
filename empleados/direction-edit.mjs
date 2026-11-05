import {createHash} from 'node:crypto';
export const AUDIT_FIELD='Historial dirección (portal)';
export const JOB_EDIT_FIELDS={client:'Nombre del Cliente',address:'Dirección',phone:'Número de teléfono',email:'Correo electrónico',description:'Descripción del trabajo',date:'Fecha prevista',start:'Hora inicio prevista (portal)',end:'Hora fin prevista (portal)',assigned:'Operarios asignados portal'};
export const REPORT_EDIT_FIELDS={hours:'Horas reales',date:'Fecha trabajo',material:'Material utilizado',notes:'Observaciones'};
export {changedJobFields} from './public/edit-fields.js';
export function editVersion(job,reports){return createHash('sha256').update(JSON.stringify({job:job.fields,reports:reports.map(r=>({id:r.id,fields:r.fields})).sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');}
export function readAudit(job){const raw=job.fields?.[AUDIT_FIELD];if(!raw)return [];let audit;try{audit=JSON.parse(raw);}catch{throw Error('Historial de dirección no válido.');}if(!Array.isArray(audit))throw Error('Historial de dirección no válido.');return audit;}
export function writeAudit(audit){const value=JSON.stringify(audit);if(value.length>90000)throw Error('El historial requiere archivo antes de añadir cambios.');return value;}
export function beforeValues(fields,changes){return Object.fromEntries(Object.keys(changes).map(k=>[k,fields[k]??null]));}
export function compatibleValues(fields,before,after){return Object.keys(after).every(k=>JSON.stringify(fields[k]??null)===JSON.stringify(before[k]??null)||JSON.stringify(fields[k]??null)===JSON.stringify(after[k]??null));}
