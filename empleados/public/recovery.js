// Device-local drafts. No credentials or signatures; expire after one day.
const PREFIX='assa-draft-v1:';
const TTL=24*60*60*1000;
export function draftKey(user,kind,job='',day=''){return PREFIX+[user,kind,job,day].join(':');}
export function freshDraft(value,now=Date.now()){return value&&Number.isFinite(value.updatedAt)&&now-value.updatedAt<TTL?value:null;}
let database;
async function db(){
  if(typeof indexedDB==='undefined')throw new Error('Este navegador no permite conservar borradores. Mantén esta pantalla abierta hasta guardar.');
  if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('assa-recovery-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return database;
}
async function transaction(mode,run){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('drafts',mode),s=tx.objectStore('drafts');let result;tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('No se ha guardado el borrador local.'));result=run(s);});}
export async function loadDraft(key){const raw=await transaction('readonly',s=>s.get(key));const value=freshDraft(raw);if(raw&&!value)await clearDraft(key);return value;}
export async function saveDraft(key,value){await transaction('readwrite',s=>s.put({...value,updatedAt:Date.now()},key));}
export async function clearDraft(key){await transaction('readwrite',s=>s.delete(key));}
export async function pendingReportDays(user,job){
 const d=await db();return new Promise((resolve,reject)=>{
   const days=[],tx=d.transaction('drafts','readonly'),r=tx.objectStore('drafts').openCursor();
   // draftKey includes an empty final component, which already supplies the separator.
   const exactPrefix=draftKey(user,'report',job);
   r.onsuccess=()=>{const c=r.result;if(c){const v=freshDraft(c.value);if(String(c.key).startsWith(exactPrefix)&&v&&(v.uploads?.length||Number(v.fields?.hours)>0||v.fields?.material||v.fields?.notes))days.push(String(c.key).slice(exactPrefix.length));c.continue();}};
   tx.oncomplete=()=>resolve(days);tx.onerror=()=>reject(tx.error);
 });
}
export async function clearUserDrafts(user){const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith(PREFIX+user+':')||!freshDraft(c.value))c.delete();c.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

export function operationalJob(job){return !/^\s*(?:PRUEBA\s+(?:\d+\b|PORTAL\b|INTERNA\b|OT\b|FIRMA\b)|TEST(?:\s|[-_])|SIMULACI[ÓO]N\b)/i.test(job.reference||'')&&!/\b(?:CLIENTE FICTICIO|PRUEBA INTERNA ASSA)\b/i.test((job.reference||'')+' '+(job.client||''));}
export function dailyReport(reports,user,day){return reports.find(r=>r.user===user&&r.date===day)||null;}
