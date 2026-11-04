import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const BASE = process.env.AIRTABLE_BASE_ID || 'appdHOIMfkGPduA83';
const T = { jobs:'tblsVLKBSafEEiUlI', clients:'tblGzayqdlCpz90vx', visits:'tblqkKyk1HvE3rFKw', reports:'tblprtqasdBxVVsNx', users:'tblZURy4PjvmL1Kr0' };
const TOKEN = process.env.AIRTABLE_TOKEN || '';
const SECRET = process.env.SESSION_SECRET || '';
const ROOTUSER = (process.env.BOOTSTRAP_USER || '').trim().toLowerCase();
const ROOTHASH = process.env.BOOTSTRAP_PASSWORD_HASH || '';
const ready = TOKEN.startsWith('pat') && SECRET.length >= 32 && ROOTUSER && ROOTHASH.startsWith('scrypt$');
const ACTIVE = new Set(['Aceptado / Programado', 'En progreso', 'Pendiente de visita']);
const F = {
  job:{ ref:'Trabajo / referencia', name:'Nombre del Cliente', address:'Dirección', phone:'Número de teléfono', desc:'Descripción del trabajo', date:'Fecha prevista', state:'Estado', assigned:'Operarios asignados portal', client:'Cliente' },
  user:{username:'Usuario',name:'Nombre',hash:'Hash contraseña',role:'Rol',active:'Activo'},
  report:{ref:'Referencia',job:'Trabajo',user:'Usuario operario',hours:'Horas reales',material:'Material utilizado',notes:'Observaciones',date:'Fecha trabajo',photos:'Fotos',done:'Finalizado',closed:'Fecha cierre'},
  visit:{title:'Visita / servicio solicitado',job:'Trabajo existente',client:'Cliente existente',contact:'Contacto por identificar',service:'Servicio',address:'Dirección de la visita',measures:'Mediciones',material:'Materiales y equipos',workers:'Operarios estimados',hours:'Horas estimadas por operario',access:'Incidencias y acceso',photos:'Fotos',notes:'Notas',next:'Siguiente paso',date:'Fecha visita',tech:'Técnico de la visita'}
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
function verify(token){try{const [body,sig]=token.split('.'); if(!body||!sig)return null; const expected=createHmac('sha256',SECRET).update(body).digest();const got=Buffer.from(sig,'base64url');if(got.length!==expected.length||!timingSafeEqual(got,expected))return null;const data=JSON.parse(Buffer.from(body,'base64url'));if(data.exp<Date.now()||!safeUsername(data.user))return null;return data;}catch{return null;}}
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
async function getOne(table,id,fields){if(!validId(id))throw failure(400,'Referencia inválida.');return airtable(table,'GET',`/${id}`,null,fields);}
async function list(table,fields,cap=500){let records=[],offset='';do{const qs=new URLSearchParams({pageSize:'100'});if(offset)qs.set('offset',offset);const data=await airtable(table,'GET',`?${qs}`,null,fields);records.push(...(data.records||[]));offset=data.offset||'';}while(offset && records.length<cap);return records.slice(0,cap);}
async function create(table,fields){return airtable(table,'POST','',{fields,typecast:false});}
async function patch(table,id,fields){return airtable(table,'PATCH',`/${id}`,{fields,typecast:false});}
async function requestBody(req){let chunks=[],bytes=0;for await(const c of req){bytes+=c.length;if(bytes>7*1024*1024)throw failure(413,'El archivo o formulario es demasiado grande.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw failure(400,'Datos no válidos.');}}
function originCheck(req){const origin=req.headers.origin;if(origin && new URL(origin).host!==req.headers.host)throw failure(403,'Solicitud no autorizada.');const site=req.headers['sec-fetch-site'];if(site && site==='cross-site')throw failure(403,'Solicitud externa bloqueada.');}
async function identify(req){const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('assa_session='))?.split('=')[1]||'';const claim=verify(raw);if(!claim)return null;
  if(claim.user===ROOTUSER && ROOTUSER && claim.role==='administrador')return {username:ROOTUSER,name:'Administración ASSA',role:'administrador'};
  const records=await list('users',Object.values(F.user));const user=records.find(x=>x.fields[F.user.username]===claim.user && x.fields[F.user.active]===true);
  return user?{username:claim.user,name:user.fields[F.user.name]||claim.user,role:user.fields[F.user.role]||'tecnico'}:null;
}
function reqAuth(user){if(!user)throw failure(401,'Accede con tu usuario y contraseña.');}
function reqAdmin(user){reqAuth(user);if(user.role!=='administrador')throw failure(403,'Solo administración puede realizar esta acción.');}
function assigned(job,user){if(user.role==='administrador')return true;const names=(job.fields[F.job.assigned]||'').toLowerCase().split(/[,;\n]/).map(v=>v.trim());return ACTIVE.has(job.fields[F.job.state]) && names.includes(user.username);}
async function authorizedJob(id,user){reqAuth(user);const job=await getOne('jobs',id,Object.values(F.job));if(!assigned(job,user))throw failure(403,'Este trabajo no está asignado a tu usuario.');return job;}
function jobView(record,admin){const f=record.fields;const data={id:record.id,reference:f[F.job.ref]||'',client:f[F.job.name]||'',address:f[F.job.address]||'',phone:f[F.job.phone]||'',description:f[F.job.desc]||'',date:f[F.job.date]||'',status:f[F.job.state]||'',assigned:f[F.job.assigned]||''};if(admin)data.clientId=(f[F.job.client]||[])[0]||'';return data;}
function reportView(r){const f=r.fields;return {id:r.id,user:f[F.report.user]||'',hours:f[F.report.hours]??'',material:f[F.report.material]||'',notes:f[F.report.notes]||'',date:f[F.report.date]||'',done:!!f[F.report.done],photos:(f[F.report.photos]||[]).map(x=>({id:x.id,filename:x.filename,url:x.thumbnails?.large?.url||x.url}))};}
function dateMadrid(){const x=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(x.map(p=>[p.type,p.value]));return `${v.year}-${v.month}-${v.day}`;}
async function attach(table,recordId,fieldId,photo){
  if(!photo || !/^image\/(jpeg|png|webp)$/.test(photo.contentType||'')||!/^[-\w. ]{1,80}$/.test(photo.filename||''))throw failure(400,'Solo se admiten fotos JPG, PNG o WebP.');
  const file=photo.file||'';if(!/^[\w+/=]+$/.test(file)||Buffer.byteLength(file,'base64')>4.8*1024*1024)throw failure(413,'La foto supera el límite de 4,8 MB.');
  const response=await fetch(`https://content.airtable.com/v0/${BASE}/${recordId}/${fieldId}/uploadAttachment`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({file,filename:photo.filename,contentType:photo.contentType})});
  if(!response.ok){console.error('Airtable upload',response.status);throw failure(502,'No se pudo subir la foto.');}return response.json();
}
function loginThrottle(ip){const now=Date.now();const item=attempts.get(ip)||{count:0,until:now+15*60000};if(item.until<now){item.count=0;item.until=now+15*60000;}item.count++;attempts.set(ip,item);return item.count<=10;}
async function api(req,res,url){const method=req.method;const p=url.pathname; if(!ready)throw failure(503,'El portal está preparado, pendiente de configurar credenciales seguras y conexión a Airtable.');
  if(method!=='GET')originCheck(req);
  if(p==='/api/login'&&method==='POST'){
    const input=await requestBody(req);const ip=`${req.socket.remoteAddress||'client'}:${safeUsername(input.username)}`;if(!loginThrottle(ip))throw failure(429,'Demasiados intentos. Prueba más tarde.');const uname=safeUsername(input.username);const pass=String(input.password||'');let account=null;
    if(uname===ROOTUSER&&comparePassword(pass,ROOTHASH))account={username:ROOTUSER,role:'administrador',name:'Administración ASSA'};
    if(!account){const users=await list('users',Object.values(F.user));const a=users.find(x=>x.fields[F.user.username]===uname&&x.fields[F.user.active]===true);if(a&&comparePassword(pass,a.fields[F.user.hash]||''))account={username:uname,role:a.fields[F.user.role],name:a.fields[F.user.name]||uname};}
    if(!account)throw failure(401,'Usuario o contraseña incorrectos.');
    cookie(res,sign({user:uname,role:account.role,exp:Date.now()+12*3600000}));return json(res,200,{user:account});
  }
  if(p==='/api/logout'&&method==='POST'){cookie(res,'',true);return json(res,200,{ok:true});}
  const user=await identify(req);reqAuth(user);const admin=user.role==='administrador';
  if(p==='/api/me'&&method==='GET')return json(res,200,{user});
  if(p==='/api/jobs'&&method==='GET'){
    const all=await list('jobs',Object.values(F.job),1000);let filtered=all.filter(x=>admin||assigned(x,user));if(!admin)filtered=filtered.filter(x=>ACTIVE.has(x.fields[F.job.state]));
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
  const assignMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/assign$/);
  if(assignMatch&&method==='PATCH'){reqAdmin(user);await getOne('jobs',assignMatch[1]);const b=await requestBody(req);const names=Array.isArray(b.users)?b.users.map(safeUsername):[];const employees=await list('users',Object.values(F.user));const allowed=new Set(employees.filter(x=>x.fields[F.user.active]===true).map(x=>x.fields[F.user.username]));if(names.some(x=>!allowed.has(x)))throw failure(400,'Algún usuario no está activo.');await patch('jobs',assignMatch[1],{[F.job.assigned]:[...new Set(names)].join(', ')});return json(res,200,{ok:true});}
  const reportsMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/reports$/);
  if(reportsMatch){await authorizedJob(reportsMatch[1],user);const all=await list('reports',Object.values(F.report),1000);const related=all.filter(r=>(r.fields[F.report.job]||[]).includes(reportsMatch[1])&&(admin||r.fields[F.report.user]===user.username));
    if(method==='GET')return json(res,200,{reports:related.map(reportView)});
    if(method==='POST'){const b=await requestBody(req);const hours=b.hours===''||b.hours===null?null:Number(b.hours);if(hours!==null&&(!Number.isFinite(hours)||hours<0||hours>24))throw failure(400,'Horas inválidas.');const ref=`${reportsMatch[1]}-${user.username}`;const fields={[F.report.ref]:ref,[F.report.job]:[reportsMatch[1]],[F.report.user]:user.username,[F.report.material]:limit(b.material,10000),[F.report.notes]:limit(b.notes,10000),[F.report.date]:/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')?b.date:dateMadrid()};if(hours!==null)fields[F.report.hours]=hours;
      const prev=related.find(r=>r.fields[F.report.user]===user.username);if(prev?.fields[F.report.done])throw failure(409,'El parte ya está cerrado.');const result=prev?await patch('reports',prev.id,fields):await create('reports',fields);return json(res,200,{report:reportView(result)});}
  }
  const finishMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/finish$/);
  if(finishMatch&&method==='POST'){await authorizedJob(finishMatch[1],user);const all=await list('reports',Object.values(F.report),1000);const report=all.find(r=>(r.fields[F.report.job]||[]).includes(finishMatch[1])&&r.fields[F.report.user]===user.username);if(!report)throw failure(400,'Guarda primero el parte de trabajo.');if(!report.fields[F.report.material]&&!report.fields[F.report.notes])throw failure(400,'Añade materiales u observaciones antes de finalizar.');await patch('reports',report.id,{[F.report.done]:true,[F.report.closed]:new Date().toISOString()});await patch('jobs',finishMatch[1],{[F.job.state]:'Terminado'});return json(res,200,{ok:true});}
  if(p==='/api/visits'&&method==='POST'){const b=await requestBody(req);if(!limit(b.title)||!limit(b.address))throw failure(400,'Indica el servicio solicitado y la dirección.');
    let job=null; if(b.job){job=await authorizedJob(b.job,user);}let clientId=job?(job.fields[F.job.client]||[])[0]:null;
    const fields={[F.visit.title]:limit(b.title,200),[F.visit.contact]:limit(b.contact,200),[F.visit.address]:limit(b.address,200),[F.visit.measures]:limit(b.measures,10000),[F.visit.material]:limit(b.material,10000),[F.visit.access]:limit(b.access,10000),[F.visit.notes]:limit(b.notes,10000),[F.visit.tech]:user.username,[F.visit.date]:dateMadrid()};
    if(job)fields[F.visit.job]=[job.id];if(clientId)fields[F.visit.client]=[clientId];
    if(b.service&&['Fontanería','Electricidad','Gas','Calderas','Climatización','Fotovoltaica','Aerotermia','Tratamiento de agua','Otros'].includes(b.service))fields[F.visit.service]=b.service;
    if(b.next&&['Preparar presupuesto','Faltan datos','Requiere otra visita','Solo registrar visita'].includes(b.next))fields[F.visit.next]=b.next;
    if(b.workers!=='')fields[F.visit.workers]=Math.max(0,Math.min(30,Number(b.workers)||0));if(b.hours!=='')fields[F.visit.hours]=Math.max(0,Math.min(1000,Number(b.hours)||0));
    const result=await create('visits',fields);return json(res,201,{id:result.id});}
  const photo=p.match(/^\/api\/(reports|visits)\/(rec[A-Za-z0-9]{14})\/photo$/);
  if(photo&&method==='POST'){const [_,type,id]=photo;const record=await getOne(type,id);if(type==='reports'){
      const workId=(record.fields[F.report.job]||[])[0];if(!workId)throw failure(403,'El parte no tiene trabajo asociado.');await authorizedJob(workId,user);if(!admin&&record.fields[F.report.user]!==user.username)throw failure(403,'No puedes modificar fotos de otro técnico.');if(record.fields[F.report.done])throw failure(409,'El parte ya está cerrado.');
    }else if(!admin&&record.fields[F.visit.tech]!==user.username)throw failure(403,'No puedes modificar otra visita.');
    const input=await requestBody(req);await attach(type,id,FIELD_PHOTOS[type],input);return json(res,200,{ok:true});}
  throw failure(404,'Ruta no encontrada.');
}
async function staticFile(req,res,p){if(req.method!=='GET')throw failure(405,'Método no permitido.');let target=p==='/'?'index.html':p.slice(1);if(target.includes('..')||target.includes('\\')||target.startsWith('.'))throw failure(404,'No existe.');target=normalize(target);const absolute=join(ROOT,'public',target);const check=await stat(absolute).catch(()=>null);if(!check?.isFile())throw failure(404,'No existe.');const data=await readFile(absolute);res.writeHead(200,{'Content-Type':MIME[extname(absolute)]||'application/octet-stream','Cache-Control':target==='index.html'?'no-store':'public, max-age=900','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://*.airtableusercontent.com; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"});res.end(data);}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`https://${req.headers.host||'localhost'}`);if(url.pathname==='/health')return json(res,200,{ok:true,configured:!!ready});if(url.pathname.startsWith('/api/'))return await api(req,res,url);return await staticFile(req,res,url.pathname);}catch(e){if(!e.status||e.status>=500)console.error('request error',e?.message||e);json(res,e.status||500,{error:e.status?e.message:'Error interno del servidor.'});}});
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
