import { economicsView } from './economics.mjs';
import http from 'node:http';
import { reportVersion, visitMarker, stripVisitMarker, writeKeys } from './reliability.mjs';
import { INSTALLATION_MODE, INSTALLATION_FIELDS as I } from './public/partner-installations.js';
import { partnerSummary } from './partner-summary.mjs';
import { REL_FIELDS, relationshipView, relationshipVersion } from './public/relationships.js';
import { prepareRelationships } from './relationships.mjs';
import { OUTCOME_FIELD, OUTCOMES, outcomeOption, outcomeVersion } from './public/outcomes.js';
import { AUDIT_FIELD, JOB_EDIT_FIELDS, REPORT_EDIT_FIELDS, editVersion, readAudit, writeAudit, beforeValues, compatibleValues } from './direction-edit.mjs';
import { validTime, overlap, assignedUsers } from './public/calendar.js';
import { reviewEvent, appendReview, validDate, scheduleSnapshot, executionSummary } from './workflow.mjs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createSignedWorkPdf } from './signed-pdf.mjs';
import { buildCommercialOT } from './ot-commercial.mjs';
import { confirmedBudget, prepareOtFields } from './ot-sync.mjs';
import { buildAdminDashboard } from './admin-dashboard.mjs';
import { buildReconciliationView } from './reconciliation-view.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const BASE = process.env.AIRTABLE_BASE_ID || 'appdHOIMfkGPduA83';
const T = { partners:'tblXXBlGHp5UByNj4', jobs:'tblsVLKBSafEEiUlI', clients:'tblGzayqdlCpz90vx', visits:'tblqkKyk1HvE3rFKw', reports:'tblprtqasdBxVVsNx', users:'tblZURy4PjvmL1Kr0', orders:'tblvZgkNh2cX1bTNx', reconciliationDocs:'tblW53PDguHrrOIs1', reconciliation:'tblMvunG5HhUA1qia', freeAgenda:'tblKc1Tvz45Fu5J9b' };
const TOKEN = (process.env.AIRTABLE_TOKEN || '').trim();
const SECRET = process.env.SESSION_SECRET || '';
const ROOTUSER = (process.env.BOOTSTRAP_USER || '').trim().toLowerCase();
const ROOTHASH = process.env.BOOTSTRAP_PASSWORD_HASH || '';
const ready = TOKEN.startsWith('pat') && SECRET.length >= 32 && ROOTUSER && ROOTHASH.startsWith('scrypt$');
const ACTIVE = new Set(['Aceptado / Programado', 'En progreso', 'Pendiente de visita']);
const F = {
  job:{ ...REL_FIELDS, installationMode:I.mode, installationUnits:I.units, executedOn:I.executedOn, ref:'Trabajo / referencia', name:'Nombre del Cliente', address:'Dirección', mapsAddress:'Dirección para Maps', phone:'Número de teléfono', email:'Correo electrónico', budget:'Nº presupuesto', total:'Importe total', service:'Servicio', desc:'Descripción del trabajo', date:'Fecha prevista', start:'Hora inicio prevista (portal)', end:'Hora fin prevista (portal)', state:'Estado', assigned:'Operarios asignados portal', client:'Cliente', invoiceRef:'Ref. factura', collected:'Importe cobrado', paymentState:'Estado cobro', invoiceSent:'Factura enviada (portal)', paymentConfirmed:'Cobro confirmado (portal)', invoiceSentAt:'Fecha confirmación envío factura (portal)', paymentConfirmedAt:'Fecha confirmación cobro (portal)', completedOn:'Fecha realizado', audit:AUDIT_FIELD, outcome:OUTCOME_FIELD },
  client:{name:'Nombre',phone:'Teléfono',email:'Email',address:'Dirección'},
  user:{username:'Usuario',name:'Nombre',hash:'Hash contraseña',role:'Rol',active:'Activo'},
  report:{ref:'Referencia',job:'Trabajo',user:'Usuario operario',hours:'Horas reales',actualStart:'Hora entrada real (portal)',actualEnd:'Hora salida real (portal)',material:'Material utilizado',notes:'Observaciones',date:'Fecha trabajo',photos:'Fotos',done:'Finalizado',closed:'Fecha cierre'},
  order:{job:'Trabajo origen',operator:'Operario',date:'Fecha instalación',time:'Hora citada',client:'Cliente',address:'Dirección',city:'Población',postal:'Código postal',phone:'Teléfono',email:'Correo electrónico',taxId:'NIF / DNI',budget:'Nº presupuesto',budgetDate:'Fecha presupuesto',previousNotes:'Observaciones previas',title:'Motivo del trabajo',detail:'Trabajos a realizar / partidas',base:'Base imponible',vat:'IVA',total:'Total IVA incluido',payment:'Forma de pago',state:'Estado parte',pdf:'Parte firmado',number:'Número de orden',internal:'Notas internas'},
  visit:{title:'Visita / servicio solicitado',job:'Trabajo existente',client:'Cliente existente',contact:'Contacto por identificar',service:'Servicio',address:'Dirección de la visita',measures:'Mediciones',material:'Materiales y equipos',workers:'Operarios estimados',hours:'Horas estimadas por operario',access:'Incidencias y acceso',photos:'Fotos',notes:'Notas',next:'Siguiente paso',date:'Fecha visita',tech:'Técnico de la visita'},
 freeAgenda:{title:'Título',date:'Fecha',start:'Hora inicio',end:'Hora fin',kind:'Tipo',location:'Lugar',notes:'Observaciones',createdBy:'Creado por',operation:'Operación ID',status:'Estado agenda',history:'Historial agenda'}
};
const FIELD_PHOTOS = { reports:'fldi3uQwhsfp7anwe', visits:'fldp141UFEZVquqTN' };
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const attempts = new Map();
const validId = s => /^rec[A-Za-z0-9]{14}$/.test(s||'');
const limit = (s, n=2000) => String(s ?? '').trim().slice(0,n);
function safeUsername(s){return limit(s,30).toLowerCase().replace(/[^a-z0-9_-]/g,'');}
function passwordHash(password, salt = randomBytes(16).toString('hex')) { return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`; }
function comparePassword(pass, hash){try{ const [alg,salt,hex]=hash.split('$'); if(alg!=='scrypt'||!salt||!/^[0-9a-f]{128}$/.test(hex))return false; const a=scryptSync(pass,salt,64),b=Buffer.from(hex,'hex'); return timingSafeEqual(a,b); }catch{return false;}}
function sign(obj){const body=Buffer.from(JSON.stringify(obj)).toString('base64url'); const sig=createHmac('sha256',SECRET).update(body).digest('base64url');return `${body}.${sig}`;}
function directionProof(e){return createHmac('sha256',SECRET).update(JSON.stringify({id:e.id,at:e.at,by:e.by,reason:e.reason,before:e.before,after:e.after,reportId:e.reportId,reportMode:e.reportMode,reportBefore:e.reportBefore,reportAfter:e.reportAfter})).digest('hex');}
function verify(token){try{const [body,sig]=token.split('.'); if(!body||!sig)return null; const expected=createHmac('sha256',SECRET).update(body).digest();const got=Buffer.from(sig,'base64url');if(got.length!==expected.length||!timingSafeEqual(got,expected))return null;const data=JSON.parse(Buffer.from(body,'base64url'));if(!Number.isFinite(data.exp)||data.exp<Date.now()||!['administrador','tecnico'].includes(data.role)||!safeUsername(data.user))return null;return data;}catch{return null;}}
function cookie(res, value, clear=false){res.setHeader('Set-Cookie',`assa_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; ${clear?'Max-Age=0':'Max-Age=43200'}`);}
function json(res,status,obj){const data=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}
function failure(status,msg){return Object.assign(new Error(msg),{status});}
async function airtable(table, method='GET', path='', body=null, fields=null){
  const url=new URL(`https://api.airtable.com/v0/${BASE}/${T[table]}${path}`);
  if(fields)for(const field of fields)url.searchParams.append('fields[]',field);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),16000);
  try{
    const resp=await fetch(url,{method,headers:{'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok){console.error('Airtable API',resp.status,data.error?.type||'error');throw failure(502,'No se pudo guardar o consultar Airtable.');}
    return data;
  }finally{clearTimeout(timer);}
}
async function getOne(table,id){if(!validId(id))throw failure(400,'Referencia inválida.');return airtable(table,'GET',`/${id}`);}
async function list(table,fields,cap=500){let records=[],offset='';do{const qs=new URLSearchParams({pageSize:'100'});if(offset)qs.set('offset',offset);const data=await airtable(table,'GET',`?${qs}`,null,fields);records.push(...(data.records||[]));offset=data.offset||'';}while(offset && records.length<cap);if(offset)throw failure(503,'La consulta supera el límite seguro. No se ha aplicado ningún cambio.');return records;}
async function create(table,fields){return airtable(table,'POST','',{fields,typecast:false});}
async function patch(table,id,fields){return airtable(table,'PATCH',`/${id}`,{fields,typecast:false});}
async function requestBody(req){let chunks=[],bytes=0;for await(const c of req){bytes+=c.length;if(bytes>7*1024*1024)throw failure(413,'El archivo o formulario es demasiado grande.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw failure(400,'Datos no válidos.');}}
function originCheck(req){const origin=req.headers.origin;if(origin && new URL(origin).host!==req.headers.host)throw failure(403,'Solicitud no autorizada.');const site=req.headers['sec-fetch-site'];if(site && site==='cross-site')throw failure(403,'Solicitud externa bloqueada.');}
async function identify(req){const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('assa_session='))?.split('=')[1]||'';const claim=verify(raw);if(!claim)return null;
  if(claim.user===ROOTUSER && ROOTUSER && claim.role==='administrador')return {username:ROOTUSER,name:'Administración ASSA',role:'administrador'};
  const records=await list('users',Object.values(F.user));const user=records.find(x=>x.fields[F.user.username]===claim.user && x.fields[F.user.active]===true);
  return user&&['administrador','tecnico'].includes(user.fields[F.user.role])?{username:claim.user,name:user.fields[F.user.name]||claim.user,role:user.fields[F.user.role]||'tecnico'}:null;
}
function reqAuth(user){if(!user)throw failure(401,'Accede con tu usuario y contraseña.');}
function reqAdmin(user){reqAuth(user);if(user.role!=='administrador')throw failure(403,'Solo administración puede realizar esta acción.');}
function assigned(job,user){if(user.role==='administrador')return true;const names=(job.fields[F.job.assigned]||'').toLowerCase().split(/[,;\n]/).map(v=>v.trim());return ACTIVE.has(job.fields[F.job.state]) && names.includes(user.username);}
async function authorizedJob(id,user){reqAuth(user);const job=await getOne('jobs',id);if(!assigned(job,user))throw failure(403,'Este trabajo no está asignado a tu usuario.');if(user.role!=='administrador'){const orders=await list('orders',[F.order.job,F.order.internal,F.order.state,F.order.pdf],3000);if(orders.some(o=>signedPendingClosure(o,id)))throw failure(403,'El parte firmado está pendiente de revisión por dirección.');}return job;}
function signedPendingClosure(order,jobId){return (order.fields[F.order.job]||[]).includes(jobId)&&order.fields[F.order.state]==='Firmado / archivado'&&!!order.fields[F.order.pdf]?.length&&reviewEvent(order)?.state==='pending';}
function freeAgendaView(record){const f=record.fields;return {id:record.id,title:f[F.freeAgenda.title]||'',date:f[F.freeAgenda.date]||'',start:f[F.freeAgenda.start]||'',end:f[F.freeAgenda.end]||'',kind:f[F.freeAgenda.kind]||'Cita libre',location:f[F.freeAgenda.location]||'',notes:f[F.freeAgenda.notes]||'',status:f[F.freeAgenda.status]||'Activa'};}
function jobView(record,admin){const f=record.fields;const data={partnerInstallation:f[I.mode]===INSTALLATION_MODE,installationUnits:f[I.units]??null,executedOn:f[I.executedOn]||'',...relationshipView(f,admin),id:record.id,reference:f[F.job.ref]||'',client:(f[I.mode]===INSTALLATION_MODE&&f[REL_FIELDS.partnerName])||f[F.job.name]||'',address:f[F.job.address]||'',mapsAddress:f[F.job.mapsAddress]||'',phone:f[F.job.phone]||'',description:f[F.job.desc]||'',date:f[F.job.date]||'',start:f[F.job.start]||'',end:f[F.job.end]||'',status:f[F.job.state]||'',outcome:f[F.job.outcome]||'',assigned:f[F.job.assigned]||''};if(admin){data.clientId=(f[F.job.client]||[])[0]||'';data.economics=economicsView(f);}return data;}
async function otJobData(job,order){
  const j=job.fields||{},o=order?.fields||{};
  let cl={};
  const clientId=(j[F.job.client]||[])[0];
  if(clientId&&validId(clientId)){
    try{cl=(await getOne('clients',clientId)).fields||{};}
    catch(error){console.warn('Linked client details unavailable for OT',error.status||'error');}
  }
  return {
    id:job.id,reference:j[F.job.ref]||'',
    client:o[F.order.client]||j[F.job.name]||cl[F.client.name]||'',
    address:o[F.order.address]||j[F.job.address]||cl[F.client.address]||'',
    phone:o[F.order.phone]||j[F.job.phone]||cl[F.client.phone]||'',
    email:o[F.order.email]||j[F.job.email]||cl[F.client.email]||'',
    city:o[F.order.city]||'',postal:o[F.order.postal]||'',taxId:o[F.order.taxId]||'',
    budget:o[F.order.budget]||j[F.job.budget]||'',
    budgetDate:o[F.order.budgetDate]||'',time:j[F.job.start]?(j[F.job.start]+(j[F.job.end]?'–'+j[F.job.end]:'')):(o[F.order.time]||''),
    service:j[F.job.service]||'',
    date:o[F.order.date]||j[F.job.date]||'',
    description:j[F.job.desc]||o[F.order.title]||'',
    previousNotes:o[F.order.previousNotes]||'',
    orderWork:o[F.order.detail]||'',
    commercial:(()=>{
      const quote=confirmedBudget({
        budget:o[F.order.budget]||j[F.job.budget]||'',
        status:j[F.job.state]||'',total:j[F.job.total],
        net:j['Venta neta sin IVA'],description:j[F.job.desc]||''
      });
      const candidate=buildCommercialOT({
        description:j[F.job.desc]||'',orderTitle:o[F.order.title]||'',
        workName:j[F.job.ref]||'',orderBase:o[F.order.base],
        orderVat:o[F.order.vat],orderTotal:o[F.order.total],
        jobTotal:j[F.job.total],jobBudget:o[F.order.budget]||j[F.job.budget]||'',
        status:j[F.job.state]||''
      });
      const conflict=quote.verified&&o[F.order.base]!=null&&
        (Math.abs(o[F.order.base]-quote.base)>.03||Math.abs((o[F.order.vat]??0)-quote.vat)>.0001);
      return {
        ...candidate,base:quote.verified&&!conflict?quote.base:null,
        vatRate:quote.verified&&!conflict?quote.vat:null,
        vatAmount:quote.verified&&!conflict?Math.round(quote.base*quote.vat*100)/100:null,
        total:quote.verified&&!conflict?quote.total:null,
        priceVerified:quote.verified&&!conflict,
        source:conflict?'Importe de OT distinto al presupuesto; revisión manual':quote.reason
      };
    })(),
    payment:o[F.order.payment]||''
  };
}
function reportView(r){const f=r.fields;return {id:r.id,version:reportVersion(r),user:f[F.report.user]||'',hours:f[F.report.hours]??'',actualStart:f[F.report.actualStart]||'',actualEnd:f[F.report.actualEnd]||'',material:f[F.report.material]||'',notes:f[F.report.notes]||'',date:f[F.report.date]||'',done:!!f[F.report.done],photos:(f[F.report.photos]||[]).map(x=>({id:x.id,filename:x.filename,url:x.thumbnails?.large?.url||x.url}))};}
function dateMadrid(){const x=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(x.map(p=>[p.type,p.value]));return `${v.year}-${v.month}-${v.day}`;}
async function attach(table,recordId,fieldId,photo){
  if(!photo || !/^image\/(jpeg|png|webp)$/.test(photo.contentType||'')||!/^[-\w. ]{1,80}$/.test(photo.filename||''))throw failure(400,'Solo se admiten fotos JPG, PNG o WebP.');
  const file=photo.file||'';if(!/^[\w+/=]+$/.test(file)||Buffer.byteLength(file,'base64')>4.8*1024*1024)throw failure(413,'La foto supera el límite de 4,8 MB.');
  const extension={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[photo.contentType];
  const filename='assa-'+createHash('sha256').update(Buffer.from(file,'base64')).digest('hex')+'.'+extension;
  const current=await getOne(table,recordId),photos=current.fields[table==='reports'?F.report.photos:F.visit.photos]||[];
  if(photos.some(p=>p.filename===filename))return {ok:true,unchanged:true};
  const response=await fetch(`https://content.airtable.com/v0/${BASE}/${recordId}/${fieldId}/uploadAttachment`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({file,filename,contentType:photo.contentType})});
  if(!response.ok){console.error('Airtable upload',response.status);throw failure(502,'No se pudo subir la foto.');}return response.json();
}
function loginThrottle(ip){const now=Date.now();const item=attempts.get(ip)||{count:0,until:now+15*60000};if(item.until<now){item.count=0;item.until=now+15*60000;}item.count++;attempts.set(ip,item);return item.count<=10;}
async function checkSlot({date,start,end,users,exclude}){
  if(date&&!validDate(date))throw failure(400,'La fecha no es válida.');
  if((start||end)&&(!date||!validTime(start)||(end&&(!validTime(end)||start>=end))))throw failure(400,'Indica una hora de entrada válida y, si añades fin previsto, debe ser posterior.');
  const jobs=await list('jobs',Object.values(F.job),3000);
  const same=jobs.filter(j=>j.id!==exclude&&ACTIVE.has(j.fields[F.job.state])&&j.fields[F.job.date]===date&&assignedUsers(j.fields[F.job.assigned]).some(u=>users.includes(u)));
  const conflicts=same.filter(j=>overlap({start,end},{start:j.fields[F.job.start],end:j.fields[F.job.end]}));
  if(conflicts.length)throw failure(409,'Solape de horario: '+conflicts.map(j=>(j.fields[F.job.name]||'Trabajo')+' '+j.fields[F.job.start]+'–'+j.fields[F.job.end]).join('; '));
  return ((start&&!end)||same.some(j=>!validTime(j.fields[F.job.start])||!validTime(j.fields[F.job.end])))?['Hay citas sin hora de fin prevista. Comprueba la disponibilidad antes de añadir otra instalación al mismo técnico.']:[];
}
function outcomeProof(e){return createHmac('sha256',SECRET).update(JSON.stringify({id:e.id,kind:e.kind,code:e.code,reason:e.reason,by:e.by,at:e.at,before:e.before})).digest('hex');}
function pendingOutcomes(job){return readAudit(job).filter(e=>e.kind==='outcome'&&['requested','applying'].includes(e.state));}
async function approveSignedClosure(job,order,user){const event=reviewEvent(order);
    if(!(order.fields[F.order.job]||[]).includes(job.id)||!event)throw failure(409,'No es un cierre de este flujo. El histórico se conserva.');
    if(event.state==='approved')return {ok:true,unchanged:true};
    if(event.state!=='pending'||order.fields[F.order.state]!=='Firmado / archivado'||!order.fields[F.order.pdf]?.length)throw failure(409,'Falta un parte firmado y archivado.');
    if(!ACTIVE.has(job.fields[F.job.state])&&!['Terminado','Facturado','Pendiente de cobro'].includes(job.fields[F.job.state]))throw failure(409,'El trabajo ha cambiado de estado. Revisión manual necesaria.');
    const reports=await list('reports',Object.values(F.report),3000);
    const related=reports.filter(r=>(r.fields[F.report.job]||[]).includes(job.id));
    if(!related.length)throw failure(409,'No hay partes de ejecución para revisar.');
    // Recover a failed report-freeze after the immutable PDF was archived.
    for(const r of related)if(!r.fields[F.report.done])await patch('reports',r.id,{[F.report.done]:true,[F.report.closed]:event.submittedAt});
    const completedFields={};if(job.fields[I.mode]===INSTALLATION_MODE&&!job.fields[I.executedOn]){const dates=related.map(r=>r.fields[F.report.date]).filter(d=>validDate(d||'')).sort();if(dates.length)completedFields[I.executedOn]=dates.at(-1);}
    const finalStatus=['Facturado','Pendiente de cobro'].includes(job.fields[F.job.state])?job.fields[F.job.state]:'Terminado';
    await patch('jobs',job.id,{[F.job.state]:finalStatus,[F.job.outcome]:outcomeOption('completed').label,...completedFields});
    await patch('orders',order.id,{[F.order.internal]:appendReview(order.fields[F.order.internal],{...event,state:'approved',reviewer:user.username,reviewedAt:new Date().toISOString()})});
    const saved=await getOne('orders',order.id),savedJob=await getOne('jobs',job.id);
    if(reviewEvent(saved)?.state!=='approved'||savedJob.fields[F.job.state]!==finalStatus)throw failure(409,'No se ha podido verificar el cierre. Actualiza y revisa.');
    return {ok:true};
}
async function approvePartnerInstallation(job,user){
  const reports=(await list('reports',Object.values(F.report),3000)).filter(r=>(r.fields[F.report.job]||[]).includes(job.id));
  if(!reports.length||!reports.some(r=>r.fields[F.report.notes]||r.fields[F.report.material]||Number(r.fields[F.report.hours])>0))throw failure(409,'Guarda primero el parte del instalador con lo realizado.');
  const dates=reports.map(r=>r.fields[F.report.date]).filter(d=>validDate(d||'')).sort();if(!dates.length)throw failure(409,'Completa la fecha real en el parte del instalador.');
  for(const report of reports)if(!report.fields[F.report.done])await patch('reports',report.id,{[F.report.done]:true,[F.report.closed]:new Date().toISOString()});
  await patch('jobs',job.id,{[I.executedOn]:dates.at(-1)});
}
async function applyOutcome(job,event,user){
  const option=outcomeOption(event.code);if(!option||event.proof!==outcomeProof(event))throw failure(409,'No se ha podido verificar el resultado.');
  const current=jobView(job,true),target=['Facturado','Pendiente de cobro'].includes(current.status)?current.status:option.status;
  const expectedBefore=event.before,expectedAfter=outcomeVersion({...current,status:target,outcome:option.label});
  if(outcomeVersion(current)!==expectedBefore&&outcomeVersion(current)!==expectedAfter)throw failure(409,'El estado ha cambiado desde que se comunicó la visita. Revisa el caso antes de cerrar.');
  const orders=(await list('orders',Object.values(F.order),3000)).filter(o=>(o.fields[F.order.job]||[]).includes(job.id));
  const signed=orders.find(o=>o.fields[F.order.pdf]?.length&&o.fields[F.order.state]==='Firmado / archivado');
  if(option.signature&&job.fields[I.mode]!==INSTALLATION_MODE&&!signed)throw failure(409,'Para marcar trabajo terminado, guarda primero la firma del cliente y su parte.');
  if(!option.signature&&orders.some(o=>o.fields[F.order.pdf]?.length))throw failure(409,'Hay un parte firmado. Revisa su cierre o añade una rectificación desde dirección.');
  let audit=readAudit(job),entry=audit.find(e=>e.id===event.id);entry.state='applying';await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(audit)});
  if(option.signature){if(job.fields[I.mode]===INSTALLATION_MODE)await approvePartnerInstallation(job,user);else await approveSignedClosure(job,signed,user);}
  await patch('jobs',job.id,{[F.job.state]:target,[F.job.outcome]:option.label});
  const saved=await getOne('jobs',job.id);
  if(saved.fields[F.job.state]!==target||saved.fields[F.job.outcome]!==option.label)throw failure(409,'No se pudo verificar el resultado. Actualiza antes de reintentar.');
  audit=readAudit(saved);entry=audit.find(e=>e.id===event.id);entry.state='approved';entry.reviewedBy=user.username;entry.reviewedAt=new Date().toISOString();await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(audit)});
  const verified=await getOne('jobs',job.id);if(!readAudit(verified).some(e=>e.id===event.id&&e.state==='approved'))throw failure(409,'No se pudo verificar el historial del resultado.');
  return {ok:true,notice:option.closed?'Caso cerrado operativamente. El cobro no se ha modificado.':'Resultado guardado; el caso sigue pendiente de la siguiente acción. El cobro no se ha modificado.'};
}
async function api(req,res,url){const method=req.method;const p=url.pathname; if(!ready)throw failure(503,'El portal está preparado, pendiente de configurar credenciales seguras y conexión a Airtable.');
  if(method!=='GET')originCheck(req);
  if(p==='/api/login'&&method==='POST'){
    const input=await requestBody(req);const ip=`${req.socket.remoteAddress||'client'}:${safeUsername(input.username)}`;if(!loginThrottle(ip))throw failure(429,'Demasiados intentos. Prueba más tarde.');const uname=safeUsername(input.username);const pass=String(input.password||'');let account=null;
    if(uname===ROOTUSER&&comparePassword(pass,ROOTHASH))account={username:ROOTUSER,role:'administrador',name:'Administración ASSA'};
    if(!account){const users=await list('users',Object.values(F.user));const a=users.find(x=>x.fields[F.user.username]===uname&&x.fields[F.user.active]===true);if(a&&comparePassword(pass,a.fields[F.user.hash]||''))account={username:uname,role:a.fields[F.user.role],name:a.fields[F.user.name]||uname};}
    if(account&&!['administrador','tecnico'].includes(account.role))account=null;
    if(!account)throw failure(401,'Usuario o contraseña incorrectos.');
    account.canManageRecords=account.role==='administrador'&&uname===ROOTUSER;
    cookie(res,sign({user:uname,role:account.role,exp:Date.now()+12*3600000}));return json(res,200,{user:account});
  }
  if(p==='/api/logout'&&method==='POST'){cookie(res,'',true);return json(res,200,{ok:true});}
  const user=await identify(req);reqAuth(user);const admin=user.role==='administrador';user.canManageRecords=admin&&user.username===ROOTUSER;
  if(p==='/api/me'&&method==='GET')return json(res,200,{user});
  if(p==='/api/jobs'&&method==='GET'){
    const all=await list('jobs',Object.values(F.job),1000);let filtered=all.filter(x=>admin||assigned(x,user));if(!admin){const orders=await list('orders',[F.order.job,F.order.internal,F.order.state,F.order.pdf],3000);const pendingSigned=new Set(orders.filter(o=>o.fields[F.order.state]==='Firmado / archivado'&&!!o.fields[F.order.pdf]?.length&&reviewEvent(o)?.state==='pending').flatMap(o=>o.fields[F.order.job]||[]));filtered=filtered.filter(x=>ACTIVE.has(x.fields[F.job.state])&&!pendingSigned.has(x.id));}
    return json(res,200,{jobs:filtered.map(x=>jobView(x,admin)).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'))});
  }
  if(p==='/api/employees'&&method==='GET'){
    reqAdmin(user);const users=await list('users',Object.values(F.user));return json(res,200,{employees:users.map(r=>({id:r.id,username:r.fields[F.user.username],name:r.fields[F.user.name],role:r.fields[F.user.role],active:!!r.fields[F.user.active]}))});
  }
  if(p==='/api/employees'&&method==='POST'){
    reqAdmin(user);const b=await requestBody(req);const uname=safeUsername(b.username);const pass=String(b.password||'');if(!/^[a-z][a-z0-9_-]{2,29}$/.test(uname)||pass.length<12||pass.length>128)throw failure(400,'Usuario de 3-30 caracteres y contraseña de al menos 12 caracteres.');
    if(uname===ROOTUSER)throw failure(409,'Usuario reservado.');const all=await list('users',[F.user.username]);if(all.some(r=>r.fields[F.user.username]===uname))throw failure(409,'Ese usuario ya existe.');
    await create('users',{[F.user.username]:uname,[F.user.name]:limit(b.name,100)||uname,[F.user.hash]:passwordHash(pass),[F.user.role]:'tecnico',[F.user.active]:true});return json(res,201,{ok:true});
  }
  const toggle=p.match(/^\/api\/employees\/(rec[A-Za-z0-9]{14})\/active$/);
  if(toggle&&method==='PATCH'){reqAdmin(user);const b=await requestBody(req);await patch('users',toggle[1],{[F.user.active]:b.active===true});return json(res,200,{ok:true});}
  const jobMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})$/);
  if(jobMatch&&method==='GET'){const j=await authorizedJob(jobMatch[1],user);return json(res,200,{job:jobView(j,admin)});}
  if(p==='/api/admin/outcomes'&&method==='GET'){
    reqAdmin(user);const jobs=await list('jobs',Object.values(F.job),3000);
    return json(res,200,{canDecide:user.username===ROOTUSER,requests:jobs.flatMap(j=>pendingOutcomes(j).map(e=>({id:e.id,code:e.code,label:outcomeOption(e.code)?.label||e.code,reason:e.reason,by:e.by,at:e.at,state:e.state,job:jobView(j,true)})))});
  }
  const outcomeMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/outcomes$/);
  if(outcomeMatch&&['GET','POST'].includes(method)){
    const job=await authorizedJob(outcomeMatch[1],user);
    if(method==='GET')return json(res,200,{options:OUTCOMES,current:job.fields[F.job.outcome]||'',pending:pendingOutcomes(job).map(e=>({id:e.id,code:e.code,label:outcomeOption(e.code)?.label,reason:e.reason,by:e.by,at:e.at,state:e.state})),version:outcomeVersion(jobView(job,admin))});
    const b=await requestBody(req),option=outcomeOption(b.code),reason=limit(b.reason,1500),audit=readAudit(job),id='outcome-'+b.operationId;
    const reviewOnly=user.role==='administrador'&&b.technicianMode===true;
    if(!option||reason.length<5||!/^[-a-f0-9]{36}$/.test(b.operationId||''))throw failure(400,'Selecciona el resultado e indica qué ocurrió (al menos cinco caracteres).');
    let event=audit.find(e=>e.id===id);
    if(event){if(event.by!==user.username||event.proof!==outcomeProof(event))throw failure(409,'No se pudo verificar esta solicitud.');if(event.state==='approved'||event.state==='requested')return json(res,200,{ok:true,pending:event.state==='requested',unchanged:true});if(event.state==='rejected')throw failure(409,'Esta solicitud fue descartada. Envía una nueva si hay información adicional.');}
    if(!event){
      if(b.expected!==outcomeVersion(jobView(job,admin)))throw failure(409,'El trabajo ha cambiado. Actualiza antes de comunicar el resultado.');
      if(pendingOutcomes(job).length)throw failure(409,'Ya hay un resultado pendiente de revisión.');
      if(user.canManageRecords&&!reviewOnly){const documents=(await list('orders',[F.order.job,F.order.pdf,F.order.state],3000)).filter(o=>(o.fields[F.order.job]||[]).includes(job.id));if(option.signature&&job.fields[I.mode]!==INSTALLATION_MODE&&!documents.some(o=>o.fields[F.order.pdf]?.length&&o.fields[F.order.state]==='Firmado / archivado'))throw failure(409,'Para marcar trabajo terminado, guarda primero la firma del cliente y su parte.');if(!option.signature&&documents.some(o=>o.fields[F.order.pdf]?.length))throw failure(409,'Hay un parte firmado. Revisa su cierre o añade una rectificación desde dirección.');}
      event={id,kind:'outcome',code:b.code,reason,by:user.username,at:new Date().toISOString(),before:b.expected,state:user.canManageRecords&&!reviewOnly?'applying':'requested'};event.proof=outcomeProof(event);audit.push(event);await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(audit)});
    }
    if(!user.canManageRecords||reviewOnly)return json(res,200,{ok:true,pending:true,notice:'Resultado enviado a Samuel. El trabajo y el cobro no se han cerrado automáticamente.'});
    return json(res,200,await applyOutcome(await getOne('jobs',job.id),event,user));
  }
  const decideOutcome=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/outcomes\/(outcome-[-a-f0-9]{36})\/decision$/);
  if(decideOutcome&&method==='POST'){
    reqAdmin(user);if(user.username!==ROOTUSER)throw failure(403,'Samuel debe confirmar el resultado.');
    const job=await getOne('jobs',decideOutcome[1]),b=await requestBody(req),audit=readAudit(job),event=audit.find(e=>e.id===decideOutcome[2]);
    if(!event||event.kind!=='outcome'||event.proof!==outcomeProof(event))throw failure(409,'Solicitud de resultado no válida.');
    if(!['approve','reject'].includes(b.decision))throw failure(400,'Decisión no válida.');
    if(event.state==='approved'||event.state==='rejected')return json(res,200,{ok:true,unchanged:true});
    if(b.decision==='reject'){const reason=limit(b.reason,800);if(reason.length<5)throw failure(400,'Indica el motivo para descartar la solicitud.');event.state='rejected';event.reviewedBy=user.username;event.reviewedAt=new Date().toISOString();event.rejectionReason=reason;await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(audit)});return json(res,200,{ok:true,notice:'Solicitud descartada. El estado del trabajo y el cobro se conservan.'});}
    return json(res,200,await applyOutcome(job,event,user));
  }
  const editMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/direction-edit$/);
  if(editMatch&&(method==='GET'||method==='PATCH')){
    reqAdmin(user);if(user.username!==ROOTUSER)throw failure(403,'Solo la cuenta principal de Samuel puede rectificar trabajos y partes.');
    const job=await getOne('jobs',editMatch[1]);
    const all=await list('reports',Object.values(F.report),3000),reports=all.filter(r=>(r.fields[F.report.job]||[]).includes(job.id));
    const orders=(await list('orders',[F.order.job,F.order.pdf,F.order.state],3000)).filter(o=>(o.fields[F.order.job]||[]).includes(job.id));
    const signed=orders.some(o=>o.fields[F.order.pdf]?.length),audit=readAudit(job);
    if(method==='GET')return json(res,200,{job:{...jobView(job,true),email:job.fields[F.job.email]||''},reports:reports.map(reportView),signed,version:editVersion(job,reports),history:audit});
    const b=await requestBody(req),reason=limit(b.reason,800);
    if(reason.length<5||!/^[-a-f0-9]{36}$/.test(b.operationId||''))throw failure(400,'Indica un motivo de al menos cinco caracteres.');
    let event=audit.find(e=>e.id===b.operationId);
    if(event&&(event.by!==user.username||event.proof!==directionProof(event)))throw failure(409,'La corrección pendiente no supera la verificación. Revisa el historial.');
    if(event?.state==='applied')return json(res,200,{ok:true,unchanged:true,notice:'Esta corrección ya está guardada.'});
    if(!event){
      if(b.expected!==editVersion(job,reports))throw failure(409,'El trabajo o el parte han cambiado. Actualiza y revisa antes de guardar.');
      const changes={};
      for(const [key,value] of Object.entries(b.changes||{})){
        if(!Object.hasOwn(JOB_EDIT_FIELDS,key))throw failure(400,'Ese campo no se puede editar desde dirección.');
        if(typeof value!=='string')throw failure(400,'Datos de trabajo no válidos.');
        const field=JOB_EDIT_FIELDS[key];
        if(value.trim()===String(job.fields[field]??'').trim())continue;
        const max=key==='description'?10000:key==='phone'?50:key==='assigned'?2000:250;
        if(value.length>max)throw failure(400,'El campo «'+field+'» admite hasta '+max+' caracteres; has introducido '+value.length+'.');
        const cleaned=value.trim();if(key==='installationUnits'&&(!/^\d+$/.test(cleaned)||Number(cleaned)<1||Number(cleaned)>100))throw failure(400,'Indica entre 1 y 100 instalaciones.');if(key==='executedOn'&&cleaned&&!validDate(cleaned))throw failure(400,'Fecha de ejecución inválida.');if(['client','description'].includes(key)&&!cleaned)throw failure(400,'El cliente y la descripción no pueden quedar vacíos.');
        if(key==='email'&&cleaned&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned))throw failure(400,'Correo electrónico inválido.');
        if(key==='phone'&&cleaned&&!/^[+()0-9 .\/-]{6,50}$/.test(cleaned))throw failure(400,'Teléfono inválido.');
        const after=key==='installationUnits'?Number(cleaned):cleaned||null;if((job.fields[field]??null)!==after)changes[field]=after;
      }
      const combined={...job.fields,...changes},users=assignedUsers(combined[F.job.assigned]);
      if(Object.hasOwn(changes,F.job.assigned)){
        const allowed=new Set((await list('users',Object.values(F.user))).filter(r=>r.fields[F.user.active]===true&&r.fields[F.user.role]==='tecnico').map(r=>r.fields[F.user.username]));
        const previousUsers=assignedUsers(job.fields[F.job.assigned]);
        if(users.some(u=>!allowed.has(u)&&!previousUsers.includes(u)))throw failure(400,'Solo se pueden añadir técnicos activos.');
      }
      if([F.job.date,F.job.start,F.job.end,F.job.assigned].some(k=>Object.hasOwn(changes,k)))await checkSlot({date:combined[F.job.date]||'',start:combined[F.job.start]||'',end:combined[F.job.end]||'',users,exclude:job.id});
      let report=null,reportChanges={},reportMode='none';
      if(b.reportId){
        report=reports.find(r=>r.id===b.reportId);if(!report)throw failure(400,'El parte no pertenece a este trabajo.');
        for(const [key,value] of Object.entries(b.reportChanges||{})){
          if(!Object.hasOwn(REPORT_EDIT_FIELDS,key))throw failure(400,'Campo de parte no permitido.');
          let after;if(key==='hours'){after=value===''||value===null?null:Number(value);if(after!==null&&(!Number.isFinite(after)||after<0||after>24))throw failure(400,'Horas inválidas.');}
          else{if(typeof value!=='string'||value.length>10000)throw failure(400,'Datos de parte no válidos.');after=value.trim()||null;if(key==='date'&&after&&!validDate(after))throw failure(400,'Fecha del parte inválida.');}
          const field=REPORT_EDIT_FIELDS[key];if((report.fields[field]??null)!==after)reportChanges[field]=after;
        }
        reportMode=signed||report.fields[F.report.done]?'annotation':'edit';
      }
      if(!Object.keys(changes).length&&!Object.keys(reportChanges).length)throw failure(400,'No hay cambios en la ficha o el parte. Escribir solo el motivo no cambia el trabajo; para indicar que no se realizó, utiliza «Resultado de la visita».');
      event={id:b.operationId,state:'pending',at:new Date().toISOString(),by:user.username,reason,
        before:beforeValues(job.fields,changes),after:changes,reportId:report?.id||null,reportMode,
        reportBefore:report?beforeValues(report.fields,reportChanges):{},reportAfter:reportChanges};
      event.proof=directionProof(event);audit.push(event);await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(audit)});
    }
    if(!['edit','annotation','none'].includes(event.reportMode)||Object.keys(event.after||{}).some(k=>!Object.values(JOB_EDIT_FIELDS).includes(k))||Object.keys(event.reportAfter||{}).some(k=>!Object.values(REPORT_EDIT_FIELDS).includes(k)))throw failure(409,'El historial contiene campos no permitidos.');
    const latest=await getOne('jobs',job.id);
    if(!compatibleValues(latest.fields,event.before,event.after))throw failure(409,'Hay una edición posterior del trabajo. No se ha sobrescrito.');
    let report;if(event.reportId){report=await getOne('reports',event.reportId);if(!(report.fields[F.report.job]||[]).includes(job.id)||!compatibleValues(report.fields,event.reportBefore,event.reportAfter))throw failure(409,'El parte ha cambiado. No se ha sobrescrito.');}
    if(Object.keys(event.after).length)await patch('jobs',job.id,event.after);
    if(report&&event.reportMode==='edit'&&Object.keys(event.reportAfter).length){
      const currentOrders=(await list('orders',[F.order.job,F.order.pdf],3000)).filter(o=>(o.fields[F.order.job]||[]).includes(job.id));
      if(report.fields[F.report.done]||currentOrders.some(o=>o.fields[F.order.pdf]?.length))throw failure(409,'El parte se ha cerrado durante la corrección. Actualiza antes de continuar.');
      await patch('reports',report.id,event.reportAfter);
    }
    const saved=await getOne('jobs',job.id);
    if(Object.keys(event.after).some(k=>JSON.stringify(saved.fields[k]??null)!==JSON.stringify(event.after[k]??null)))throw failure(409,'No se ha podido verificar el trabajo corregido.');
    if(report&&event.reportMode==='edit'){const savedReport=await getOne('reports',report.id);if(Object.keys(event.reportAfter).some(k=>JSON.stringify(savedReport.fields[k]??null)!==JSON.stringify(event.reportAfter[k]??null)))throw failure(409,'No se ha podido verificar el parte corregido.');}
    const currentAudit=readAudit(saved),savedEvent=currentAudit.find(e=>e.id===event.id);if(!savedEvent)throw failure(409,'No se ha podido verificar el historial.');
    savedEvent.state='applied';savedEvent.appliedAt=new Date().toISOString();await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(currentAudit)});
    const verified=await getOne('jobs',job.id);if(!readAudit(verified).some(e=>e.id===event.id&&e.state==='applied'))throw failure(409,'No se ha podido verificar la auditoría.');
    return json(res,200,{ok:true,notice:event.reportMode==='annotation'?'Rectificación añadida al historial. El parte cerrado y su PDF original se conservan.':'Corrección de dirección guardada con historial. No se ha cambiado el estado del trabajo.'});
  }
  const scheduleMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/schedule$/);
  if(scheduleMatch&&method==='PATCH'){
    reqAdmin(user);
    const job=await getOne('jobs',scheduleMatch[1]),b=await requestBody(req);
    if(!ACTIVE.has(job.fields[F.job.state]))throw failure(409,'Solo se pueden planificar trabajos abiertos.');
    const prior=scheduleSnapshot(job.fields);
    if(!b.expected||b.expected.date!==prior.date||b.expected.assigned!==prior.assigned||(b.expected.start||'')!==prior.start||(b.expected.end||'')!==prior.end)
      throw failure(409,'La planificación ha cambiado. Actualiza y revisa antes de guardar.');
    if(typeof b.date!=='string'||(b.date&&!validDate(b.date))||!Array.isArray(b.users)||b.users.some(x=>typeof x!=='string'||safeUsername(x)!==x))
      throw failure(400,'Indica una fecha válida y usuarios del equipo.');
    const employees=await list('users',Object.values(F.user));
    const allowed=new Set(employees.filter(x=>x.fields[F.user.active]===true&&x.fields[F.user.role]==='tecnico').map(x=>x.fields[F.user.username]));if(user.username===ROOTUSER)allowed.add(ROOTUSER);
    if(b.users.some(x=>!allowed.has(x)))throw failure(400,'Solo se pueden asignar técnicos activos.');
    const orders=await list('orders',[F.order.job,F.order.internal,F.order.state,F.order.pdf],3000);
    if(orders.some(o=>(o.fields[F.order.job]||[]).includes(job.id)&&(reviewEvent(o)?.state==='pending'||o.fields[F.order.pdf]?.length)))throw failure(409,'Hay un cierre pendiente o un parte firmado protegido.');
    const start=b.start||'',end=b.end||'';
    const warnings=await checkSlot({date:b.date,start,end,users:b.users,exclude:job.id});
    const changes={[F.job.start]:start,[F.job.end]:end,[F.job.date]:b.date||null,[F.job.assigned]:[...new Set(b.users)].join(', ')};
    await patch('jobs',job.id,changes);
    const saved=await getOne('jobs',job.id);
    const stored=scheduleSnapshot(saved.fields);
    if(stored.date!==b.date||stored.assigned!==changes[F.job.assigned]||stored.start!==start||stored.end!==end)throw failure(409,'Revisa la planificación: no coincide con el cambio solicitado.');
    return json(res,200,{job:jobView(saved,true),warnings});
  }
  if(p==='/api/admin/partner-installations'&&method==='GET'){
    reqAdmin(user);const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'',partnerId=url.searchParams.get('partnerId')||'';if(!validDate(from)||!validDate(to)||from>to||(partnerId&&partnerId!=='other'&&!validId(partnerId)))throw failure(400,'Selecciona colaborador y fechas válidas.');
    const [jobs,orders]=await Promise.all([list('jobs',Object.values(F.job),3000),list('orders',[F.order.job,F.order.pdf,F.order.state,F.order.internal],3000)]);
    return json(res,200,partnerSummary(jobs,orders,{from,to,partnerId}));
  }
  if(p==='/api/collaborators'&&method==='GET'){
    reqAdmin(user);const records=await list('partners',['Nombre','Papel habitual','Notas'],1000);
    return json(res,200,{collaborators:records.map(r=>({id:r.id,name:r.fields.Nombre||'',role:r.fields['Papel habitual']||'',notes:r.fields.Notas||''})).sort((a,b)=>a.name.localeCompare(b.name))});
  }
  const relationMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/relationships$/);
  if(relationMatch&&method==='PATCH'){
    reqAdmin(user);if(user.username!==ROOTUSER)throw failure(403,'La cuenta principal de Samuel debe confirmar las relaciones del trabajo.');
    const job=await getOne('jobs',relationMatch[1]),b=await requestBody(req),reason=limit(b.reason,800),audit=readAudit(job),id='relationships-'+b.operationId;
    if(reason.length<5||!/^[-a-f0-9]{36}$/.test(b.operationId||''))throw failure(400,'Indica el motivo de la relación o corrección.');
    let event=audit.find(e=>e.id===id);
    if(event){if(event.by!==user.username||event.proof!==directionProof(event))throw failure(409,'No se pudo verificar esta modificación.');if(event.state==='applied')return json(res,200,{ok:true,unchanged:true});}
    if(!event){
      if(b.expected!==relationshipVersion(jobView(job,true)))throw failure(409,'Las relaciones del trabajo han cambiado. Actualiza antes de guardar.');
      const after=await prepareRelationships(b.relationships,job.fields,{findPartner:id=>getOne('partners',id),findClient:id=>getOne('clients',id)});
      if(!Object.keys(after).length)throw failure(400,'No hay cambios de colaborador, ocupante o destinatario previsto.');
      event={id,kind:'relationships',by:user.username,at:new Date().toISOString(),reason,before:beforeValues(job.fields,after),after,reportId:null,reportMode:'none',reportBefore:{},reportAfter:{},state:'pending'};event.proof=directionProof(event);audit.push(event);await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(audit)});
    }
    if(Object.keys(event.after).some(k=>!Object.values(REL_FIELDS).includes(k)))throw failure(409,'Campo de relación no permitido en el historial.');
    const current=await getOne('jobs',job.id);if(!compatibleValues(current.fields,event.before,event.after))throw failure(409,'Hay una modificación posterior; no se ha sobrescrito.');
    await patch('jobs',job.id,event.after);const saved=await getOne('jobs',job.id);
    if(Object.keys(event.after).some(k=>JSON.stringify(saved.fields[k]??(Array.isArray(event.after[k])?[]:null))!==JSON.stringify(event.after[k])))throw failure(409,'No se pudo verificar la relación guardada.');
    const history=readAudit(saved),entry=history.find(e=>e.id===event.id);if(!entry)throw failure(409,'No se pudo verificar el historial.');entry.state='applied';entry.appliedAt=new Date().toISOString();await patch('jobs',job.id,{[AUDIT_FIELD]:writeAudit(history)});
    const verified=await getOne('jobs',job.id);if(!readAudit(verified).some(e=>e.id===event.id&&e.state==='applied'))throw failure(409,'No se pudo verificar la auditoría de relaciones.');
    return json(res,200,{ok:true,job:jobView(verified,true),notice:'Colaborador, ocupante y destinatario previsto guardados. Ninguna factura, cobro ni cliente histórico se ha modificado.'});
  }
  if(p==='/api/clients'&&method==='GET'){
    reqAdmin(user);const clients=await list('clients',Object.values(F.client),3000);
    return json(res,200,{clients:clients.map(c=>({id:c.id,name:c.fields[F.client.name]||'',phone:c.fields[F.client.phone]||'',address:c.fields[F.client.address]||''}))});
  }
  if(p==='/api/agenda-notes'&&method==='GET'){
    reqAdmin(user);const notes=await list('freeAgenda',Object.values(F.freeAgenda),3000);
    return json(res,200,{notes:notes.map(freeAgendaView).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'99:99').localeCompare(b.start||'99:99'))});
  }
  if(p==='/api/agenda-notes'&&method==='POST'){
    reqAdmin(user);const b=await requestBody(req),title=limit(b.title,160),date=limit(b.date,10),start=limit(b.start,5),end=limit(b.end,5);
    const allowed=['Cita libre','Visita informal','Reunión','Recordatorio'];
    if(!/^[a-f0-9-]{36}$/.test(b.operationId||'')||!title||!validDate(date)||!allowed.includes(b.kind||'Cita libre'))throw failure(400,'Indica un título, una fecha válida y un tipo de cita.');
    if((start&&!validTime(start))||(end&&(!start||!validTime(end)||end<=start)))throw failure(400,'Revisa la hora de inicio y fin de la cita.');
    const existing=(await list('freeAgenda',Object.values(F.freeAgenda),3000)).find(n=>n.fields[F.freeAgenda.operation]===b.operationId);
    if(existing)return json(res,200,{note:freeAgendaView(existing),unchanged:true});
    const fields={[F.freeAgenda.title]:title,[F.freeAgenda.date]:date,[F.freeAgenda.kind]:b.kind||'Cita libre',[F.freeAgenda.createdBy]:user.username,[F.freeAgenda.operation]:b.operationId,[F.freeAgenda.status]:'Activa'};
    if(start)fields[F.freeAgenda.start]=start;if(end)fields[F.freeAgenda.end]=end;
    if(limit(b.location,220))fields[F.freeAgenda.location]=limit(b.location,220);if(limit(b.notes,2000))fields[F.freeAgenda.notes]=limit(b.notes,2000);
    const saved=await create('freeAgenda',fields);
    return json(res,201,{note:freeAgendaView(saved),notice:'Anotación guardada en tu agenda. No se ha creado un cliente ni una orden de trabajo.'});
  }
  // La agenda permite anular y recuperar reservas sin borrar expedientes ni tocar finanzas.
  const agendaJobMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/agenda-state$/);
  if(agendaJobMatch&&method==='PATCH'){
    reqAdmin(user);if(user.username!==ROOTUSER)throw failure(403,'Solo Samuel puede cancelar o recuperar trabajos.');
    const b=await requestBody(req),action=b.action;
    if(!['cancel','restore'].includes(action)||!/^[-a-f0-9]{36}$/.test(b.operationId||''))throw failure(400,'Operación de agenda no válida.');
    const job=await getOne('jobs',agendaJobMatch[1]),before=jobView(job,true),audit=readAudit(job),id='agenda-'+b.operationId;
    if(audit.some(e=>e.id===id&&e.kind==='agenda-status'&&e.action===action))return json(res,200,{ok:true,unchanged:true,job:before});
    if(b.expected?.status!==before.status||b.expected?.outcome!==(before.outcome||''))throw failure(409,'El trabajo ha cambiado. Actualiza la agenda antes de continuar.');
    if(action==='cancel'&&!['Aceptado / Programado','Pendiente de visita'].includes(before.status))throw failure(409,'Solo se pueden anular desde la agenda citas aún no iniciadas. Consulta el trabajo para otros casos.');
    if(action==='restore'&&before.status!=='Cancelado')throw failure(409,'Solo se puede recuperar una cita cancelada.');
    const [orders,reports]=await Promise.all([list('orders',[F.order.job,F.order.pdf,F.order.state,F.order.internal],3000),list('reports',[F.report.job,F.report.hours,F.report.done,F.report.material,F.report.notes],3000)]);
    const relatedOrders=orders.filter(o=>(o.fields[F.order.job]||[]).includes(job.id));
    if(relatedOrders.some(o=>o.fields[F.order.pdf]?.length||reviewEvent(o)?.state==='pending'))throw failure(409,'El trabajo tiene un parte firmado o pendiente de cierre. Debes revisarlo desde dirección.');
    const relatedReports=reports.filter(r=>(r.fields[F.report.job]||[]).includes(job.id));
    if(relatedReports.some(r=>r.fields[F.report.done]||Number(r.fields[F.report.hours])>0||limit(r.fields[F.report.material])||limit(r.fields[F.report.notes])))throw failure(409,'Hay ejecución o un parte registrado. Revisa el trabajo antes de anular o recuperar la cita.');
    let nextState='Cancelado',nextOutcome='Cancelado por ASSA',warnings=[];
    if(action==='restore'){
      const previous=[...audit].reverse().find(e=>e.kind==='agenda-status'&&e.action==='cancel'&&e.afterStatus==='Cancelado');
      nextState=['Aceptado / Programado','Pendiente de visita'].includes(previous?.beforeStatus)?previous.beforeStatus:'Aceptado / Programado';
      nextOutcome=previous?.beforeOutcome||'';
      const users=assignedUsers(before.assigned);
      if(users.length){const employees=await list('users',Object.values(F.user));const available=new Set(employees.filter(x=>x.fields[F.user.active]===true&&x.fields[F.user.role]==='tecnico').map(x=>x.fields[F.user.username]));if(users.some(x=>!available.has(x)))throw failure(409,'Algún técnico ya no está activo. Revisa su asignación antes de recuperar esta cita.');}
      if(before.date&&before.start&&users.length)warnings=await checkSlot({date:before.date,start:before.start,end:before.end,users,exclude:job.id});
    }
    const entry={id,kind:'agenda-status',action,by:user.username,at:new Date().toISOString(),beforeStatus:before.status,beforeOutcome:before.outcome||'',afterStatus:nextState,afterOutcome:nextOutcome};
    const fields={[F.job.state]:nextState,[F.job.outcome]:nextOutcome,[AUDIT_FIELD]:writeAudit([...audit,entry])};
    await patch('jobs',job.id,fields);
    const verified=await getOne('jobs',job.id);
    if(verified.fields[F.job.state]!==nextState||(verified.fields[F.job.outcome]||'')!==nextOutcome||!readAudit(verified).some(e=>e.id===id))throw failure(409,'No se ha podido verificar el cambio. Actualiza antes de reintentar.');
    return json(res,200,{ok:true,job:jobView(verified,true),warnings,notice:action==='cancel'?'Cita cancelada. Se conserva el expediente y no se ha modificado la facturación.':'Cita recuperada. Comprueba la disponibilidad y avisa al equipo si corresponde.'});
  }
  const agendaNoteMatch=p.match(/^\/api\/agenda-notes\/(rec[A-Za-z0-9]{14})\/state$/);
  if(agendaNoteMatch&&method==='PATCH'){
    reqAdmin(user);if(user.username!==ROOTUSER)throw failure(403,'Solo Samuel puede cancelar o recuperar citas libres.');
    const b=await requestBody(req);
    if(!['cancel','restore'].includes(b.action)||!/^[-a-f0-9]{36}$/.test(b.operationId||''))throw failure(400,'Operación de agenda no válida.');
    const note=await getOne('freeAgenda',agendaNoteMatch[1]),before=freeAgendaView(note);
    let audit=[];try{audit=JSON.parse(note.fields[F.freeAgenda.history]||'[]');}catch{throw failure(409,'El historial de la cita no es válido.');}
    if(!Array.isArray(audit))throw failure(409,'El historial de la cita no es válido.');
    if(audit.some(e=>e.id===b.operationId&&e.action===b.action))return json(res,200,{ok:true,unchanged:true,note:before});
    if(b.expectedStatus!==before.status)throw failure(409,'La cita ha cambiado. Actualiza la agenda.');
    if((b.action==='cancel'&&before.status!=='Activa')||(b.action==='restore'&&before.status!=='Cancelada'))throw failure(409,'La cita ya no está en ese estado.');
    const status=b.action==='cancel'?'Cancelada':'Activa';
    audit.push({id:b.operationId,action:b.action,by:user.username,at:new Date().toISOString(),before:before.status,after:status});
    const raw=JSON.stringify(audit);if(raw.length>90000)throw failure(409,'El historial requiere revisión antes de continuar.');
    await patch('freeAgenda',note.id,{[F.freeAgenda.status]:status,[F.freeAgenda.history]:raw});
    const verified=await getOne('freeAgenda',note.id);
    if(freeAgendaView(verified).status!==status)throw failure(409,'No se ha podido verificar la cita. Actualiza la agenda.');
    return json(res,200,{ok:true,note:freeAgendaView(verified),notice:b.action==='cancel'?'Cita libre cancelada y archivada.':'Cita libre recuperada.'});
  }
  if(p==='/api/appointments'&&method==='POST'){
    reqAdmin(user);const b=await requestBody(req),partnerInstallation=b.billingMode==='partner';
    if(b.billingMode&&!['direct','partner'].includes(b.billingMode))throw failure(400,'Modalidad de encargo no válida.');
    if(partnerInstallation&&b.kind!=='installation')throw failure(400,'Selecciona instalación para colaborador.');
    const description=limit(b.description,220)||(partnerInstallation?'Instalación para colaborador':'');
    if(!/^[a-f0-9-]{36}$/.test(b.operationId||'')||!['installation','visit'].includes(b.kind)||!description||!Array.isArray(b.users)||!b.users.length)
      throw failure(400,'Indica el trabajo, al menos un técnico y el tipo de cita.');
    const reference='AGENDA-'+b.operationId;
    const jobs=await list('jobs',Object.values(F.job),3000);
    const existing=jobs.find(j=>j.fields[F.job.ref]===reference);
    if(existing)return json(res,200,{job:jobView(existing,true),unchanged:true});
    const employees=await list('users',Object.values(F.user));
    const allowed=new Set(employees.filter(x=>x.fields[F.user.active]===true&&x.fields[F.user.role]==='tecnico').map(x=>x.fields[F.user.username]));if(user.username===ROOTUSER)allowed.add(ROOTUSER);
    if(b.users.some(x=>!allowed.has(x)))throw failure(400,'Selecciona técnicos activos.');
    if(!b.date||!validTime(b.start))throw failure(400,'La cita nueva necesita fecha y hora de entrada.');
    const warnings=await checkSlot({date:b.date,start:b.start,end:b.end,users:b.users});
    let client=null,name=limit(b.name,200),phone=limit(b.phone,50),address=limit(b.address,220);
    if(partnerInstallation&&b.relationships?.partnerId==='other'){name='Colaborador por confirmar';phone='';b.relationships={partnerId:'other',partnerOther:b.relationships.partnerOther||'',partnerRole:''};}
    else if(partnerInstallation){if(!validId(b.relationships?.partnerId))throw failure(400,'Selecciona el colaborador que encarga la instalación.');const partner=await getOne('partners',b.relationships.partnerId);name=partner.fields.Nombre||'';phone='';b.relationships={...b.relationships,partnerRole:'Contratista'};}
    else if(b.clientId){client=await getOne('clients',b.clientId);name=client.fields[F.client.name]||'';phone=client.fields[F.client.phone]||phone;address=address||client.fields[F.client.address]||'';}
    else{
      if(!name||!/^\+?[0-9 ()-]{9,25}$/.test(phone)||phone.replace(/\D/g,'').length<9)throw failure(400,'Para un cliente directo, indica nombre y teléfono o selecciona su ficha. Si la instalación es de Mongas u otro colaborador, selecciona «Instalación para colaborador» arriba.');
      const normalized=x=>String(x||'').replace(/\D/g,'').replace(/^(?:0034|34)(?=\d{9}$)/,'');
      const clients=await list('clients',[F.client.phone],3000);
      if(clients.some(c=>normalized(c.fields[F.client.phone])===normalized(phone)))throw failure(409,'Ese teléfono ya figura en CLIENTES. Selecciona la ficha correcta para evitar duplicados.');
    }
    if(!name||!address)throw failure(400,'Falta el nombre del cliente o la dirección de la instalación.');
    const fields={[F.job.ref]:reference,[F.job.name]:name,[F.job.phone]:phone,[F.job.address]:address,[F.job.desc]:description,
      [F.job.state]:b.kind==='visit'?'Pendiente de visita':'Aceptado / Programado',[F.job.date]:b.date,[F.job.start]:b.start,[F.job.end]:b.end||null,[F.job.assigned]:[...new Set(b.users)].join(', ')};
    if(client)fields[F.job.client]=[client.id];
    if(partnerInstallation){const units=b.units===undefined||b.units===''?1:Number(b.units);if(!Number.isInteger(units)||units<1||units>100)throw failure(400,'Indica entre 1 y 100 instalaciones.');fields[I.mode]=INSTALLATION_MODE;fields[I.units]=units;}
    const relationships=await prepareRelationships(b.relationships||{}, {},{findPartner:id=>getOne('partners',id),findClient:id=>getOne('clients',id)});Object.assign(fields,relationships);
    const created=await create('jobs',fields),saved=await getOne('jobs',created.id);
    return json(res,201,{job:jobView(saved,true),warnings,notice:partnerInstallation?'Instalación del colaborador guardada sin datos del cliente final.':client?'Instalación añadida al calendario.':'Cita añadida con contacto por verificar; no se ha creado ni fusionado una ficha de CLIENTES.'});
  }
  if(p==='/api/admin/closures'&&method==='GET'){
    reqAdmin(user);
    const [orders,jobs]=await Promise.all([list('orders',[F.order.job,F.order.internal,F.order.state,F.order.pdf,F.order.number],3000),list('jobs',Object.values(F.job),3000)]);
    const pending=orders.filter(o=>reviewEvent(o)?.state==='pending').map(o=>({id:o.id,number:o.fields[F.order.number]||'',signed:o.fields[F.order.state]==='Firmado / archivado'&&!!o.fields[F.order.pdf]?.length,event:reviewEvent(o),job:jobs.find(j=>j.id===o.fields[F.order.job]?.[0])}));
    return json(res,200,{canApprove:user.username===ROOTUSER,closures:pending.map(o=>({...o,job:o.job?jobView(o.job,true):null}))});
  }
  const approveMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/approve-closure$/);
  if(approveMatch&&method==='POST'){
    reqAdmin(user);if(user.username!==ROOTUSER)throw failure(403,'El cierre final requiere la cuenta de Samuel.');
    const b=await requestBody(req),job=await getOne('jobs',approveMatch[1]);
    const order=await getOne('orders',b.orderId),event=reviewEvent(order);
    return json(res,200,await approveSignedClosure(job,order,user));
  }



  const prepareMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/prepare-ot$/);
  if(prepareMatch&&method==='POST'){
    reqAdmin(user);
    const job=await getOne('jobs',prepareMatch[1]);
    const jf=job.fields;
    if(!['Aceptado / Programado','En progreso'].includes(jf[F.job.state]))
      throw failure(409,'Solo se puede preparar una OT desde un presupuesto aceptado.');
    const all=await list('orders',Object.values(F.order),1000);
    const related=all.filter(x=>(x.fields[F.order.job]||[]).includes(job.id));
    if(related.length>1)throw failure(409,'Hay varias OT vinculadas. Revisarlas antes de crear o modificar.');
    const existing=related[0]||null;
    const st=existing?.fields[F.order.state]||'';
    if(existing&&(st==='Firmado / archivado'||st==='Entregado al operario'||(existing.fields[F.order.pdf]||[]).length))
      return json(res,200,{status:'archivada',message:'La OT ya está firmada o entregada. No se modifica.',number:existing.fields[F.order.number]});
    const price=confirmedBudget({
      budget:jf[F.job.budget],status:jf[F.job.state],total:jf[F.job.total],
      net:jf['Venta neta sin IVA'],description:jf[F.job.desc]
    });
    const values={
      id:job.id,client:jf[F.job.name],address:jf[F.job.address],
      phone:jf[F.job.phone],email:jf[F.job.email],budget:jf[F.job.budget],
      date:jf[F.job.date],description:jf[F.job.desc],
      service:jf[F.job.service]?.name||''
    };
    const {fields,conflict,reason}=prepareOtFields({
      job:values,existing:existing?existing.fields:null,price
    });
    if(conflict)throw failure(409,'Precio de OT diferente al presupuesto. Revisar manualmente; no se ha modificado.');
    const cleaned=Object.fromEntries(Object.entries(fields).filter(([k,v])=>
      v!==null&&v!==undefined&&v!==''&&!(k==='Motivo del trabajo'&&!jf[F.job.service])
    ));
    let order=existing,updated=false;
    if(existing){
      if(Object.keys(cleaned).length){order=await patch('orders',existing.id,cleaned);updated=true;}
    }else{
      order=await create('orders',cleaned);updated=true;
    }
    const current=await getOne('orders',order.id);
    return json(res,200,{
      status:existing?(updated?'actualizada':'sin_cambios'):'creada',
      orderId:order.id,number:current.fields[F.order.number]||'',
      priceVerified:price.verified,priceReason:price.reason,
      price:price.verified?{base:price.base,vatRate:price.vat,total:price.total}:null,
      message:price.verified?'OT vinculada y precio validado.':'OT preparada sin precio: falta confirmar el importe del presupuesto.'
    });
  }

  const otDetailsMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/ot-details$/);
  if(otDetailsMatch&&(method==='GET'||method==='PATCH')){
    const job=await authorizedJob(otDetailsMatch[1],user);
    const orders=await list('orders',Object.values(F.order),1000);
    const related=orders.filter(x=>(x.fields[F.order.job]||[]).includes(job.id));
    let order=related.find(x=>x.fields[F.order.state]==='Pendiente de completar')||
      related.find(x=>x.fields[F.order.state]==='Firmado / archivado')||related[0];
    const signed=related.some(x=>(x.fields[F.order.pdf]||[]).length);
    if(method==='PATCH'){
      reqAdmin(user);
      const b=await requestBody(req);
      const allowed={client:200,address:220,phone:50,email:200,city:100,postal:14,taxId:32,budgetDate:10,time:40};
      const fields={},jobChanges={};
      for(const [key,max] of Object.entries(allowed)){
        if(!Object.hasOwn(b,key))continue;
        const value=limit(b[key],max);
        if(key==='email'&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          throw failure(400,'El correo electrónico no tiene un formato válido.');
        if(key==='budgetDate'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))
          throw failure(400,'La fecha del presupuesto debe tener formato AAAA-MM-DD.');
        if(key==='phone'&&value&&!/^[+()0-9 .-]{6,50}$/.test(value))
          throw failure(400,'El teléfono debe contener un número válido.');
        if(!value)continue; // Los campos vacíos no deben borrar datos ya confirmados en el CRM.
        fields[F.order[key]]=value;
        if(['client','address','phone','email'].includes(key))jobChanges[F.job[key==='client'?'name':key]]=value;
      }
      if(!Object.keys(fields).length)throw failure(400,'No hay datos para guardar.');
      if(signed||!ACTIVE.has(job.fields[F.job.state]))throw failure(409,'El histórico y los partes firmados están protegidos.');
      if(order){
        await patch('orders',order.id,fields);
      }else{
        const newFields={
          ...fields,[F.order.job]:[job.id],
          [F.order.client]:fields[F.order.client]||job.fields[F.job.name]||'Cliente pendiente',
          [F.order.date]:job.fields[F.job.date]||dateMadrid(),
          [F.order.budget]:job.fields[F.job.budget]||undefined,
          [F.order.state]:'Pendiente de completar',
          [F.order.internal]:'OT preliminar creada desde el portal por '+user.username+
            ' el '+new Date().toISOString()+'. Sin factura emitida.'
        };
        for(const key of Object.keys(newFields))if(newFields[key]===undefined)delete newFields[key];
        order=await create('orders',newFields);
      }
      if(Object.keys(jobChanges).length)await patch('jobs',job.id,jobChanges);
      const changedJob=await getOne('jobs',job.id);
      const changedOrder=await getOne('orders',order.id);
      const info=await otJobData(changedJob,changedOrder);
      return json(res,200,{ok:true,info,number:changedOrder.fields[F.order.number]||'',
        signed,documentNotice:signed?'Se han completado datos administrativos; el PDF firmado no ha sido alterado.':'OT preliminar actualizada en Airtable.'});
    }
    const info=await otJobData(job,order);
    const missing=[];
    for(const [k,label] of Object.entries({
      client:'Nombre del cliente',address:'Dirección de la intervención',phone:'Teléfono',
      email:'Correo electrónico',city:'Población',postal:'Código postal',taxId:'NIF / DNI'
    }))if(!info[k])missing.push(label);
    if(!info.commercial.priceVerified)missing.push('Importe del presupuesto aceptado y su IVA');
    const reports=await list('reports',Object.values(F.report),3000);
    const summary=executionSummary(reports.filter(r=>(r.fields[F.report.job]||[]).includes(job.id)));
    return json(res,200,{info,summary,number:order?.fields[F.order.number]||'Sin OT numerada',
      missing,signed,editable:admin&&!signed&&ACTIVE.has(job.fields[F.job.state])});
  }


  // Solo administración puede ver enlaces a facturas, datos fiscales y evidencias.
  // Etapa piloto: este endpoint no admite escrituras ni altera facturas/cobros.
  if(p==='/api/admin/reconciliation'&&method==='GET'){
    reqAdmin(user);
    const [proposals,documents,jobs,clients]=await Promise.all([
      list('reconciliation',null,500),
      list('reconciliationDocs',null,500),
      list('jobs',[F.job.ref,F.job.name],3000),
      list('clients',[F.client.name],3000)
    ]);
    return json(res,200,buildReconciliationView({proposals,documents,jobs,clients}));
  }

  const reconciliationDecisionMatch=p.match(/^\/api\/admin\/reconciliation\/(rec[A-Za-z0-9]{14})\/decision$/);
  if(reconciliationDecisionMatch&&method==='PATCH'){
    reqAdmin(user);
    const body=await requestBody(req);
    if(!['Validada sin aplicar','Descartada'].includes(body.decision))
      throw failure(400,'Decisión de conciliación no válida.');
    const proposal=await getOne('reconciliation',reconciliationDecisionMatch[1]);
    const previous=proposal.fields['Decisión administración']||'Pendiente';
    if(previous===body.decision)return json(res,200,{ok:true,unchanged:true,decision:previous});
    if(previous!=='Pendiente')
      throw failure(409,'Esta propuesta ya tiene una decisión. Para rectificarla, revisa el registro de auditoría en Airtable.');
    const evidenceLink=(proposal.fields['Documento verificado']||[])[0];
    if(!evidenceLink)throw failure(409,'No hay documento indexado; no puede aprobarse sin evidencia.');
    await getOne('reconciliationDocs',evidenceLink);
    await patch('reconciliation',proposal.id,{
      'Decisión administración':body.decision,
      'Revisado por':user.username,
      'Fecha de decisión':new Date().toISOString()
    });
    return json(res,200,{ok:true,decision:body.decision,
      notice:'Revisión documental guardada en Airtable. Ninguna factura, cliente ni cobro se ha modificado.'});
  }

  if(p==='/api/admin/dashboard'&&method==='GET'){
    reqAdmin(user);
    const dashFields=[F.job.ref,F.job.name,F.job.address,F.job.state,F.job.total,F.job.client,F.job.desc,
      F.job.collected,F.job.paymentState,F.job.invoiceRef,F.job.invoiceSent,
      F.job.paymentConfirmed,F.job.invoiceSentAt,F.job.paymentConfirmedAt,
      F.job.budget,F.job.date,F.job.completedOn,F.job.outcome];
    const orderFields=[F.order.job,F.order.state,F.order.pdf,F.order.number];
    const [jobs,orders,clients]=await Promise.all([
      list('jobs',dashFields,3000),list('orders',orderFields,3000),list('clients',[F.client.name,F.client.address],3000)
    ]);
    return json(res,200,buildAdminDashboard(jobs,orders,clients));
  }
  const adminConfirmMatch=p.match(/^\/api\/admin\/jobs\/(rec[A-Za-z0-9]{14})\/confirm$/);
  if(adminConfirmMatch&&method==='PATCH'){
    reqAdmin(user);throw failure(403,'Las confirmaciones de facturas y cobros están protegidas en esta entrega.');
  }

  const otPreviewMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/ot$/);
  if(otPreviewMatch&&method==='GET'){
    const job=await authorizedJob(otPreviewMatch[1],user);
    const [reports,orders]=await Promise.all([
      list('reports',Object.values(F.report),1000),
      list('orders',Object.values(F.order),1000)
    ]);
    const related=reports.filter(x=>(x.fields[F.report.job]||[]).includes(job.id));
    const own=related.find(x=>x.fields[F.report.user]===user.username);
    const chosen=own||(admin?related[0]:null);
    const o=orders.find(x=>(x.fields[F.order.job]||[]).includes(job.id)&&x.fields[F.order.state]==='Pendiente de completar')||
      orders.find(x=>(x.fields[F.order.job]||[]).includes(job.id));
    const details=chosen?.fields||{},order=o?.fields||{};
    const report={
      user:details[F.report.user]||order[F.order.operator]||user.username,
      date:details[F.report.date]||order[F.order.date]||dateMadrid(),
      hours:details[F.report.hours]??'',
      material:details[F.report.material]||'',
      notes:details[F.report.notes]||''
    };
    const pdf=await createSignedWorkPdf({
      number:order[F.order.number]||'BORRADOR SIN NUMERAR',
      job:await otJobData(job,o),
      report,signer:'',address:order[F.order.address]||job.fields[F.job.address],
      customerNotes:'',signedAt:new Date().toISOString(),signature:null,receiptHash:''
    });
    res.writeHead(200,{
      'Content-Type':'application/pdf',
      'Content-Disposition':'inline; filename="ASSA_OT_vista_previa.pdf"',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    });
    return res.end(pdf);
  }
  const signedMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/signed$/);
  if(signedMatch&&method==='GET'){
    await authorizedJob(signedMatch[1],user);
    const records=await list('orders',Object.values(F.order),1000);
    const parts=records.filter(x=>(x.fields[F.order.job]||[]).includes(signedMatch[1])&&
      x.fields[F.order.state]==='Firmado / archivado').map(x=>({
        id:x.id,number:x.fields[F.order.number]||'Parte firmado',
        file:(x.fields[F.order.pdf]||[])[0]||null
      }));
    return json(res,200,{parts});
  }
  const signMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/sign$/);
  if(signMatch&&method==='POST'){
    const job=await authorizedJob(signMatch[1],user);
    if(!ACTIVE.has(job.fields[F.job.state]))throw failure(409,'Este trabajo ya no está abierto.');
    const b=await requestBody(req);
    const signer=limit(b.signer,120),address=limit(b.address,220),customerNotes=limit(b.customerNotes,1900);
    if(signer.length<3||b.accepted!==true)throw failure(400,'Indica el nombre de quien firma y su conformidad con la recepción.');
    const imageMatch=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.signature||''));
    if(!imageMatch||imageMatch[1].length>2800000)throw failure(400,'Falta una firma manuscrita válida.');
    const signature=Buffer.from(imageMatch[1],'base64');
    if(signature.length<150||signature.length>2000000||signature.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw failure(400,'No se ha podido leer la firma.');
    const allReports=await list('reports',Object.values(F.report),1000);
    const candidates=allReports.filter(r=>(r.fields[F.report.job]||[]).includes(job.id)).sort((a,b)=>String(b.fields[F.report.date]||'').localeCompare(String(a.fields[F.report.date]||'')));
    const selected=candidates.find(r=>r.fields[F.report.user]===user.username)||
      (admin?candidates.find(r=>!r.fields[F.report.done]):null);
    if(!selected||(!selected.fields[F.report.material]&&!selected.fields[F.report.notes]))throw failure(400,'Guarda antes el parte con materiales u observaciones.');
    const allOrders=await list('orders',Object.values(F.order),1000);
    const related=allOrders.filter(r=>(r.fields[F.order.job]||[]).includes(job.id));
    const already=related.find(r=>r.fields[F.order.state]==='Firmado / archivado'&&(r.fields[F.order.pdf]||[]).length);
    if(already){
      if(!reviewEvent(already))return json(res,200,{ok:true,alreadySigned:true,part:{id:already.id,number:already.fields[F.order.number]||'',file:already.fields[F.order.pdf][0]}});
      // Si falló un paso posterior a guardar el PDF, recuperar el cierre sin duplicar partes.
      for(const r of candidates)if(!r.fields[F.report.done])await patch('reports',r.id,{[F.report.done]:true,[F.report.closed]:new Date().toISOString()});
      // PDF already archived: recover the report without closing the job.
      return json(res,200,{ok:true,alreadySigned:true,
        part:{id:already.id,number:already.fields[F.order.number]||'',file:(already.fields[F.order.pdf]||[])[0]||null}});
    }
    const now=new Date(),signedAt=now.toISOString();
    const reference='PORTAL-FIRMA:'+job.id;
    const receiptHash=createHash('sha256').update(JSON.stringify({job:job.id,report:selected.id,signer,address,customerNotes,signedAt})).update(signature).digest('hex').slice(0,24);
    const report={...executionSummary(candidates),date:selected.fields[F.report.date]};
    let order=related.find(r=>r.fields[F.order.state]==='Pendiente de completar'&&String(r.fields[F.order.internal]||'').includes(reference))||
      related.find(r=>r.fields[F.order.state]==='Pendiente de completar'&&!(r.fields[F.order.pdf]||[]).length);
    if(!order){
      const fields={
        [F.order.job]:[job.id],[F.order.operator]:report.user||user.username,
        [F.order.date]:/^\d{4}-\d{2}-\d{2}$/.test(report.date||'')?report.date:dateMadrid(),
        [F.order.client]:limit(job.fields[F.job.name],250)||'Cliente',
        [F.order.address]:address||limit(job.fields[F.job.address],220),
        [F.order.title]:limit(job.fields[F.job.desc],220)||'Intervención técnica',
        [F.order.detail]:limit('Descripción del encargo:\n'+(job.fields[F.job.desc]||'')+'\n\nTrabajo realizado:\n'+(report.notes||'')+
          '\n\nMateriales:\n'+(report.material||'')+'\n\nObservaciones cliente:\n'+customerNotes,20000),
        [F.order.state]:'Pendiente de completar',
        [F.order.internal]:reference+' | Creado desde el portal de empleados. Fecha firma: '+signedAt+
          ' | Firmante: '+signer+' | Operario: '+user.username+' | Verificación: '+receiptHash
      };
      if(job.fields[F.job.phone])fields[F.order.phone]=limit(job.fields[F.job.phone],50);
      order=await create('orders',fields);
    }
    let current=await getOne('orders',order.id);
    if(!reviewEvent(current)){
      current=await patch('orders',order.id,{[F.order.internal]:appendReview(current.fields[F.order.internal],{state:'pending',submittedBy:user.username,submittedAt:signedAt})});
    }
    if(!(current.fields[F.order.pdf]||[]).length){
      const pdf=await createSignedWorkPdf({
        number:current.fields[F.order.number]||order.id,
        job:await otJobData(job,current),
        report,signer,address,customerNotes,signedAt,signature,receiptHash
      });
      if(pdf.length>4.8*1024*1024)throw failure(413,'El parte firmado es demasiado grande.');
      const filename='ASSA_PARTE_FIRMADO_'+(current.fields[F.order.number]||order.id).replace(/[^-\w]/g,'_')+'.pdf';
      const upload=await fetch('https://content.airtable.com/v0/'+BASE+'/'+order.id+'/fldKN4rSAmjwUqyNK/uploadAttachment',{
        method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
        body:JSON.stringify({file:pdf.toString('base64'),filename,contentType:'application/pdf'})
      });
      if(!upload.ok){console.error('Airtable signed PDF upload',upload.status);throw failure(502,'El PDF no se pudo guardar en Airtable. Prueba de nuevo.');}
    }
    await patch('orders',order.id,{[F.order.state]:'Firmado / archivado'});
    for(const r of candidates)if(!r.fields[F.report.done])await patch('reports',r.id,{[F.report.done]:true,[F.report.closed]:signedAt});
    // The job remains open until Samuel approves it from the private panel.
    const archived=await getOne('orders',order.id);
    return json(res,200,{ok:true,part:{id:order.id,number:archived.fields[F.order.number]||'',
      file:(archived.fields[F.order.pdf]||[])[0]||null}});
  }

  const reportsMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/reports$/);
  if(reportsMatch){await authorizedJob(reportsMatch[1],user);const all=await list('reports',Object.values(F.report),1000);const related=all.filter(r=>(r.fields[F.report.job]||[]).includes(reportsMatch[1])&&(admin||r.fields[F.report.user]===user.username));
    if(method==='GET')return json(res,200,{reports:related.map(reportView)});
    if(method==='POST'){
      const job=await getOne('jobs',reportsMatch[1]);if(!ACTIVE.has(job.fields[F.job.state]))throw failure(409,'El trabajo no está abierto.');
      const orders=await list('orders',[F.order.job,F.order.pdf],3000);
      if(orders.some(o=>(o.fields[F.order.job]||[]).includes(job.id)&&o.fields[F.order.pdf]?.length))throw failure(409,'El trabajo tiene un parte firmado; la ejecución está bloqueada.');
      const b=await requestBody(req);const hours=b.hours===''||b.hours===null?null:Number(b.hours);if(hours!==null&&(!Number.isFinite(hours)||hours<0||hours>24))throw failure(400,'Horas inválidas.');const day=b.date||dateMadrid();if(!validDate(day))throw failure(400,'Indica una fecha de jornada válida.');const ref=`${reportsMatch[1]}-${user.username}-${day}`;const fields={[F.report.ref]:ref,[F.report.job]:[reportsMatch[1]],[F.report.user]:user.username,[F.report.material]:limit(b.material,10000),[F.report.notes]:limit(b.notes,10000),[F.report.date]:day};if(hours!==null)fields[F.report.hours]=hours;
      const matches=related.filter(r=>r.fields[F.report.user]===user.username&&r.fields[F.report.date]===day);
      if(matches.length>1)throw failure(409,'Hay varios partes de esta jornada. Dirección debe revisarlos antes de editar.');
      const prev=matches[0];
      if(b.reportId&&b.reportId!==prev?.id)throw failure(409,'La jornada ha cambiado. Actualiza antes de guardar.');
      if(b.expected&&!(b.expected==='new'&&!prev)&&b.expected!==reportVersion(prev)){
        const same=prev&&Object.entries(fields).every(([key,value])=>key===F.report.ref||JSON.stringify(prev.fields[key]??'')===JSON.stringify(value))&&
          (!Object.hasOwn(b,'actualStart')||(prev.fields[F.report.actualStart]||'')===b.actualStart)&&(!Object.hasOwn(b,'actualEnd')||(prev.fields[F.report.actualEnd]||'')===b.actualEnd);
        if(same)return json(res,200,{report:reportView(prev),recovered:true});
        throw failure(409,'El parte ha cambiado desde que lo abriste. Conservamos tu borrador; revisa el registro antes de sobrescribir.');
      }
      const actualStart=Object.hasOwn(b,'actualStart')?b.actualStart:prev?.fields[F.report.actualStart]||'',actualEnd=Object.hasOwn(b,'actualEnd')?b.actualEnd:prev?.fields[F.report.actualEnd]||'';if((actualStart&&!validTime(actualStart))||(actualEnd&&(!validTime(actualEnd)||!validTime(actualStart)||actualEnd<=actualStart)))throw failure(400,'Indica entrada y salida reales del mismo día, con salida posterior a la entrada.');if(Object.hasOwn(b,'actualStart'))fields[F.report.actualStart]=actualStart||null;if(Object.hasOwn(b,'actualEnd'))fields[F.report.actualEnd]=actualEnd||null;if(prev?.fields[F.report.done])throw failure(409,'El parte ya está cerrado.');const result=prev?await patch('reports',prev.id,fields):await create('reports',fields);return json(res,200,{report:reportView(result)});}
  }
  const finishMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/finish$/);
  if(finishMatch&&method==='POST')throw failure(409,'Para finalizar, usa Firmar y finalizar trabajo. El cliente debe firmar el parte.');
  if(p==='/api/visits'&&method==='POST'){const b=await requestBody(req);if(!limit(b.title)||!limit(b.address))throw failure(400,'Indica el servicio solicitado y la dirección.');
    let marker='';
    if(b.operationId){
      if(!/^[a-f0-9-]{36}$/.test(b.operationId))throw failure(400,'Identificador de visita inválido.');
      marker=visitMarker(user.username,b.operationId);
      const previous=(await list('visits',[F.visit.notes,F.visit.tech],3000)).find(r=>r.fields[F.visit.tech]===user.username&&String(r.fields[F.visit.notes]||'').split('\n').includes(marker));
      if(previous)return json(res,200,{id:previous.id,recovered:true});
    }
    let job=null; if(b.job){job=await authorizedJob(b.job,user);}let clientId=job?(job.fields[F.job.client]||[])[0]:null;
    const fields={[F.visit.title]:limit(b.title,200),[F.visit.contact]:limit(b.contact,200),[F.visit.address]:limit(b.address,200),[F.visit.measures]:limit(b.measures,10000),[F.visit.material]:limit(b.material,10000),[F.visit.access]:limit(b.access,10000),[F.visit.notes]:limit(stripVisitMarker(b.notes),10000)+(marker?'\n'+marker:''),[F.visit.tech]:user.username,[F.visit.date]:dateMadrid()};
    if(job)fields[F.visit.job]=[job.id];if(clientId)fields[F.visit.client]=[clientId];
    if(b.service&&['Fontanería','Electricidad','Gas','Calderas','Climatización','Fotovoltaica','Aerotermia','Tratamiento de agua','Otros'].includes(b.service))fields[F.visit.service]=b.service;
    if(b.next&&['Preparar presupuesto','Faltan datos','Requiere otra visita','Solo registrar visita'].includes(b.next))fields[F.visit.next]=b.next;
    if(b.workers!=='')fields[F.visit.workers]=Math.max(0,Math.min(30,Number(b.workers)||0));if(b.hours!=='')fields[F.visit.hours]=Math.max(0,Math.min(1000,Number(b.hours)||0));
    const result=await create('visits',fields);return json(res,201,{id:result.id});}
  const photo=p.match(/^\/api\/(reports|visits)\/(rec[A-Za-z0-9]{14})\/photo$/);
  if(photo&&method==='POST'){const [_,type,id]=photo;const record=await getOne(type,id);if(type==='reports'){
      const workId=(record.fields[F.report.job]||[])[0];if(!workId)throw failure(403,'El parte no tiene trabajo asociado.');const jobKey='job:'+workId;if(writingJobs.has(jobKey))throw failure(409,'El trabajo se está guardando. Reintenta la foto en un momento.');writingJobs.add(jobKey);req.portalLocks.push(jobKey);await authorizedJob(workId,user);if(!admin&&record.fields[F.report.user]!==user.username)throw failure(403,'No puedes modificar fotos de otro técnico.');if(record.fields[F.report.done])throw failure(409,'El parte ya está cerrado.');
    }else if(!admin&&record.fields[F.visit.tech]!==user.username)throw failure(403,'No puedes modificar otra visita.');
    const input=await requestBody(req);await attach(type,id,FIELD_PHOTOS[type],input);return json(res,200,{ok:true});}
  throw failure(404,'Ruta no encontrada.');
}
async function staticFile(req,res,p){if(req.method!=='GET')throw failure(405,'Método no permitido.');let target=p==='/'?'index.html':p.slice(1);if(target.includes('..')||target.includes('\\')||target.startsWith('.'))throw failure(404,'No existe.');target=normalize(target);const absolute=join(ROOT,'public',target);const check=await stat(absolute).catch(()=>null);if(!check?.isFile())throw failure(404,'No existe.');const data=await readFile(absolute);res.writeHead(200,{'Content-Type':MIME[extname(absolute)]||'application/octet-stream','Cache-Control':target==='index.html'?'no-store':'public, max-age=900','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://*.airtableusercontent.com; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"});res.end(data);}
const writingJobs=new Set();
const server=http.createServer(async(req,res)=>{let held=[];try{
  const url=new URL(req.url,`https://${req.headers.host||'localhost'}`);
  const keys=writeKeys(url.pathname,req.method);
  if(keys.some(k=>writingJobs.has(k)))throw failure(409,'Este registro se está guardando. Espera un momento antes de reintentar.');
  held=keys;req.portalLocks=held;for(const key of held)writingJobs.add(key);
  if(url.pathname==='/health')return json(res,200,{ok:true,configured:!!ready,release:'daily-recovery-v12'});
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  return await staticFile(req,res,url.pathname);
}catch(e){if(!e.status||e.status>=500)console.error('request error',e?.message||e);json(res,e.status||500,{error:e.status?e.message:'Error interno del servidor.'});}finally{for(const key of held)writingJobs.delete(key);}});
if(process.env.NODE_ENV!=='test' && !process.env.NODE_TEST_CONTEXT)server.listen(PORT,'0.0.0.0',()=>{
  console.log(`ASSA Portal listening on :${PORT}; configured: ${!!ready}`);
  if(!ready) console.log('ASSA setup checks (no secrets):',JSON.stringify({
    airtableTokenFormatOk:TOKEN.startsWith('pat'),
    sessionSecretOk:SECRET.length>=32,
    bootstrapUserOk:!!ROOTUSER,
    bootstrapHashOk:ROOTHASH.startsWith('scrypt$')
  }));
});
export { passwordHash,comparePassword,sign,verify,server };

