import { createHash } from 'node:crypto';
export function reportVersion(record){
 const fields=record?.fields;
 const keys=['Horas reales','Material utilizado','Observaciones','Fecha trabajo','Hora entrada real (portal)','Hora salida real (portal)','Finalizado'];
 return createHash('sha256').update(JSON.stringify(fields?keys.map(key=>[key,fields[key]??null]):null)).digest('hex');
}
export function visitMarker(user,operation){return `[PORTAL-VISITA:${user}:${operation}]`;}
export function stripVisitMarker(notes){return String(notes||'').replace(/\n?\[PORTAL-VISITA:[^\]\n]+\]/g,'');}
// Planning retains a shared lock to prevent cross-job scheduling collisions.
export function writeKeys(path,method){
 if(['GET','HEAD'].includes(method))return [];
 const job=path.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})(?:\/|$)/);
 if(job)return [...(/\/(schedule|agenda-state|direction-edit)$/.test(path)?['planning']:[]),'job:'+job[1]];
 if(path==='/api/appointments')return ['planning'];
 if(path==='/api/visits')return ['visits:create'];
 const photo=path.match(/^\/api\/(reports|visits)\/(rec[A-Za-z0-9]{14})\/photo$/);
 if(photo)return ['photo:'+photo[1]+':'+photo[2]];
 if(path==='/api/agenda-notes')return ['notes:create'];
 const note=path.match(/^\/api\/agenda-notes\/(rec[A-Za-z0-9]{14})\/state$/);
 return note?['note:'+note[1]]:[];
}
