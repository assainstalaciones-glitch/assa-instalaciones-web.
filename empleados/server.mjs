import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createSignedWorkPdf } from './signed-pdf.mjs';
import { buildCommercialOT } from './ot-commercial.mjs';
import { confirmedBudget, prepareOtFields } from './ot-sync.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const BASE = process.env.AIRTABLE_BASE_ID || 'appdHOIMfkGPduA83';
const T = { jobs:'tblsVLKBSafEEiUlI', clients:'tblGzayqdlCpz90vx', visits:'tblqkKyk1HvE3rFKw', reports:'tblprtqasdBxVVsNx', users:'tblZURy4PjvmL1Kr0', orders:'tblvZgkNh2cX1bTNx' };
const TOKEN = (process.env.AIRTABLE_TOKEN || '').trim();
const SECRET = process.env.SESSION_SECRET || '';
const ROOTUSER = (process.env.BOOTSTRAP_USER || '').trim().toLowerCase();
const ROOTHASH = process.env.BOOTSTRAP_PASSWORD_HASH || '';
const ready = TOKEN.startsWith('pat') && SECRET.length >= 32 && ROOTUSER && ROOTHASH.startsWith('scrypt$');
const ACTIVE = new Set(['Aceptado / Programado', 'En progreso', 'Pendiente de visita']);
const F = {
  job:{ ref:'Trabajo / referencia', name:'Nombre del Cliente', address:'Dirección', phone:'Número de teléfono', email:'Correo electrónico', budget:'Nº presupuesto', total:'Importe total', service:'Servicio', desc:'Descripción del trabajo', date:'Fecha prevista', state:'Estado', assigned:'Operarios asignados portal', client:'Cliente' },
  client:{name:'Nombre',phone:'Teléfono',email:'Email',address:'Dirección'},
  user:{username:'Usuario',name:'Nombre',hash:'Hash contraseña',role:'Rol',active:'Activo'},
  report:{ref:'Referencia',job:'Trabajo',user:'Usuario operario',hours:'Horas reales',material:'Material utilizado',notes:'Observaciones',date:'Fecha trabajo',photos:'Fotos',done:'Finalizado',closed:'Fecha cierre'},
  order:{job:'Trabajo origen',operator:'Operario',date:'Fecha instalación',time:'Hora citada',client:'Cliente',address:'Dirección',city:'Población',postal:'Código postal',phone:'Teléfono',email:'Correo electrónico',taxId:'NIF / DNI',budget:'Nº presupuesto',budgetDate:'Fecha presupuesto',previousNotes:'Observaciones previas',title:'Motivo del trabajo',detail:'Trabajos a realizar / partidas',base:'Base imponible',vat:'IVA',total:'Total IVA incluido',payment:'Forma de pago',state:'Estado parte',pdf:'Parte firmado',number:'Número de orden',internal:'Notas internas'},
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
async function getOne(table,id){if(!validId(id))throw failure(400,'Referencia inválida.');return airtable(table,'GET',`/${id}`);}
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
async function authorizedJob(id,user){reqAuth(user);const job=await getOne('jobs',id);if(!assigned(job,user))throw failure(403,'Este trabajo no está asignado a tu usuario.');return job;}
function jobView(record,admin){const f=record.fields;const data={id:record.id,reference:f[F.job.ref]||'',client:f[F.job.name]||'',address:f[F.job.address]||'',phone:f[F.job.phone]||'',description:f[F.job.desc]||'',date:f[F.job.date]||'',status:f[F.job.state]||'',assigned:f[F.job.assigned]||''};if(admin)data.clientId=(f[F.job.client]||[])[0]||'';return data;}
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
    budgetDate:o[F.order.budgetDate]||'',time:o[F.order.time]||'',
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
    const signed=related.some(x=>x.fields[F.order.state]==='Firmado / archivado'&&
      (x.fields[F.order.pdf]||[]).length);
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
      // La ficha administrativa se puede completar después, sin sustituir el PDF original firmado.
      if(order){
        if(signed){
          const prior=order.fields[F.order.internal]||'';
          const audit='DATOS ADMINISTRATIVOS ACTUALIZADOS '+new Date().toISOString()+' por '+user.username+
            ' (OT firmada conservada; campos: '+Object.keys(b).filter(x=>allowed[x]).join(', ')+')';
          fields[F.order.internal]=(prior+'\n'+audit).trim().slice(-8500);
        }
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
    return json(res,200,{info,number:order?.fields[F.order.number]||'Sin OT numerada',
      missing,signed,editable:admin});
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
    const candidates=allReports.filter(r=>(r.fields[F.report.job]||[]).includes(job.id));
    const selected=candidates.find(r=>r.fields[F.report.user]===user.username)||
      (admin?candidates.find(r=>!r.fields[F.report.done]):null);
    if(!selected||(!selected.fields[F.report.material]&&!selected.fields[F.report.notes]))throw failure(400,'Guarda antes el parte con materiales u observaciones.');
    const allOrders=await list('orders',Object.values(F.order),1000);
    const related=allOrders.filter(r=>(r.fields[F.order.job]||[]).includes(job.id));
    const already=related.find(r=>r.fields[F.order.state]==='Firmado / archivado'&&(r.fields[F.order.pdf]||[]).length);
    if(already){
      // Si falló un paso posterior a guardar el PDF, recuperar el cierre sin duplicar partes.
      const current=candidates.find(r=>r.fields[F.report.user]===user.username)||
        (admin?candidates.find(r=>!r.fields[F.report.done]):null);
      if(current&&!current.fields[F.report.done]){
        await patch('reports',current.id,{[F.report.done]:true,[F.report.closed]:new Date().toISOString()});
      }
      await patch('jobs',job.id,{[F.job.state]:'Terminado'});
      return json(res,200,{ok:true,alreadySigned:true,
        part:{id:already.id,number:already.fields[F.order.number]||'',file:(already.fields[F.order.pdf]||[])[0]||null}});
    }
    const now=new Date(),signedAt=now.toISOString();
    const reference='PORTAL-FIRMA:'+job.id;
    const receiptHash=createHash('sha256').update(JSON.stringify({job:job.id,report:selected.id,signer,address,customerNotes,signedAt})).update(signature).digest('hex').slice(0,24);
    const report={user:selected.fields[F.report.user],date:selected.fields[F.report.date],
      hours:selected.fields[F.report.hours],material:selected.fields[F.report.material],notes:selected.fields[F.report.notes]};
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
    const current=await getOne('orders',order.id);
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
    await patch('reports',selected.id,{[F.report.done]:true,[F.report.closed]:signedAt});
    await patch('jobs',job.id,{[F.job.state]:'Terminado'});
    const archived=await getOne('orders',order.id);
    return json(res,200,{ok:true,part:{id:order.id,number:archived.fields[F.order.number]||'',
      file:(archived.fields[F.order.pdf]||[])[0]||null}});
  }

  const reportsMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/reports$/);
  if(reportsMatch){await authorizedJob(reportsMatch[1],user);const all=await list('reports',Object.values(F.report),1000);const related=all.filter(r=>(r.fields[F.report.job]||[]).includes(reportsMatch[1])&&(admin||r.fields[F.report.user]===user.username));
    if(method==='GET')return json(res,200,{reports:related.map(reportView)});
    if(method==='POST'){const b=await requestBody(req);const hours=b.hours===''||b.hours===null?null:Number(b.hours);if(hours!==null&&(!Number.isFinite(hours)||hours<0||hours>24))throw failure(400,'Horas inválidas.');const ref=`${reportsMatch[1]}-${user.username}`;const fields={[F.report.ref]:ref,[F.report.job]:[reportsMatch[1]],[F.report.user]:user.username,[F.report.material]:limit(b.material,10000),[F.report.notes]:limit(b.notes,10000),[F.report.date]:/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')?b.date:dateMadrid()};if(hours!==null)fields[F.report.hours]=hours;
      const prev=related.find(r=>r.fields[F.report.user]===user.username);if(prev?.fields[F.report.done])throw failure(409,'El parte ya está cerrado.');const result=prev?await patch('reports',prev.id,fields):await create('reports',fields);return json(res,200,{report:reportView(result)});}
  }
  const finishMatch=p.match(/^\/api\/jobs\/(rec[A-Za-z0-9]{14})\/finish$/);
  if(finishMatch&&method==='POST')throw failure(409,'Para finalizar, usa Firmar y finalizar trabajo. El cliente debe firmar el parte.');
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
