import { draftKey, loadDraft, saveDraft, clearDraft, clearUserDrafts, pendingReportDays, operationalJob, dailyReport } from './recovery.js';
import { fifteenDayRange } from './partner-installations.js';
import { REL_FIELDS, relationshipVersion, PARTNER_ROLES, OCCUPANT_ROLES } from './relationships.js';
import { changedJobFields } from './edit-fields.js';
import { mapsDestination } from './navigation-address.js';
import { OUTCOMES, outcomeOption, outcomeVersion } from './outcomes.js';
import { calendarCells, shiftMonth, madridToday, assignedUsers, dailyGaps, OPEN_STATUSES } from './calendar.js';
const el=document.querySelector('#app');
const draftSessions=new Set();
const state={me:null,viewMode:'direccion',showAllTechnicianJobs:false,jobs:[],employees:[],closures:[],outcomeRequests:[],outcomeOperationId:'',canDecideOutcomes:false,canApprove:false,agendaDate:madridToday(),agendaMonth:madridToday().slice(0,7),agendaTech:'',agendaPartner:'',agendaNotes:[],agendaShowCancelled:false,newAppointmentMode:'free',clients:[],partners:[],relationshipOperationId:'',summaryRange:fifteenDayRange(madridToday()),summaryPartner:'',partnerCounts:null,newAppointment:false,newAppointmentId:'',dashboard:null,dashboardFilter:'review',dashboardSearch:'',reconciliation:null,reconciliationFilter:'review',reconciliationSearch:'',page:'today',reportDay:'',job:null,reports:[],signedParts:[],signedResult:null,otData:null,directionEdit:null,editOperationId:'',search:'',status:'active',savedVisit:null};
const isAdminUser=()=>state.me?.role==='administrador';
const isDirectionMode=()=>isAdminUser()&&state.viewMode!=='instalador';
const technicianJobVisible=job=>!isAdminUser()||isDirectionMode()||state.showAllTechnicianJobs||assignedUsers(job.assigned||'').includes(state.me.username);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function jobContactActions(job,compact=false){
 const address=String(job?.address||'').trim();
 const destination=mapsDestination(address,job?.mapsAddress||'');
 const rawPhone=String(job?.accessPhone||job?.phone||'').trim();
 const phone=rawPhone.split(/[\/;,]|\s+y\s+/i)[0].replace(/[^\d+]/g,'').replace(/(?!^)\+/g,'');
 const hasAddress=!!destination&&!/^(?:por confirmar|a confirmar|pendiente.*|sin direcci[oó]n.*|direcci[oó]n pendiente.*|direcci[oó]n no registrada.*|-+)$/i.test(destination);
 const hasPhone=/^\+?\d{9,15}$/.test(phone);
 if(!hasAddress&&!hasPhone)return '';
 return `<div class="quick-contact${compact?' compact':''}" aria-label="Accesos rápidos del cliente">${hasAddress?`<a class="button light ${compact?'small':''}" href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(destination)}" target="_blank" rel="noopener noreferrer" aria-label="Cómo llegar a ${h(destination)}">📍 Cómo llegar</a>`:''}${hasPhone?`<a class="button ghost ${compact?'small':''}" href="tel:${h(phone)}" aria-label="${job?.accessPhone?'Llamar al contacto de acceso':'Llamar al cliente'} ${h(rawPhone)}">📞 ${job?.accessPhone?'Llamar acceso':'Llamar'}</a>`:''}</div>`;
}
const api=async(path,method='GET',data)=>{const resp=await fetch(`/api${path}`,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:data===undefined?undefined:JSON.stringify(data)});const json=await resp.json().catch(()=>({}));if(!resp.ok)throw Object.assign(new Error(json.error||`Error ${resp.status}`),{status:resp.status});return json;};
let toastTimer;function toast(message,error=false){const box=document.querySelector('#toast');box.textContent=message;box.className=error?'visible error':'visible';clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='',4600);}
function busy(btn,on){if(btn){btn.disabled=on;btn.dataset.label||=btn.textContent;btn.innerHTML=on?'<span class="loader"></span> Guardando…':h(btn.dataset.label);}}
function field(name,label,value='',type='text',attrs=''){return `<div class="form-field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${h(value)}" ${attrs}></div>`;}
function area(name,label,value='',placeholder=''){return `<div class="form-field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" placeholder="${h(placeholder)}">${h(value)}</textarea></div>`;}
function select(name,label,choices,value='',empty='Seleccionar…'){return `<div class="form-field"><label for="${name}">${label}</label><select id="${name}" name="${name}"><option value="">${empty}</option>${choices.map(x=>{const v=typeof x==='string'?x:x.value;const label=typeof x==='string'?x:x.label;return `<option value="${h(v)}" ${v===value?'selected':''}>${h(label)}</option>`;}).join('')}</select></div>`;}
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function layout(content){const admin=isDirectionMode();const nav=[['today','☀️','Hoy'],...(admin?[['dashboard','📊','Dirección'],['reconciliation','🔎','Conciliación']]:[]),['agenda','📅','Agenda'],['jobs','📋','Trabajos'],['visits','📍','Visitas'],...(admin?[['users','👷','Empleados']]:[])];const navButtons=nav.map(([page,ico,label])=>`<button class="navbtn ${state.page===page?'active':''}" data-nav="${page}"><span class="navicon">${ico}</span>${label}</button>`).join('');const primary=admin?['today','agenda','jobs','dashboard']:['today','agenda','jobs','visits'];
 const bottom=nav.filter(([page])=>primary.includes(page)).map(([page,ico,label])=>`<button class="${state.page===page?'active':''}" data-nav="${page}"><span>${ico}</span>${label}</button>`).join('')+(admin?`<details class="more-nav"><summary><span>☰</span>Más</summary><div>${nav.filter(([page])=>!primary.includes(page)).map(([page,ico,label])=>`<button data-nav="${page}">${ico} ${label}</button>`).join('')}</div></details>`:'');
 el.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-logo">A</span><span>ASSA <small style="display:block;font-size:10px;letter-spacing:1px;font-weight:600;color:#9cb9c8">INSTALACIONES</small></span></div>${navButtons}<div class="side-bottom"><strong>${h(state.me?.name||'')}</strong>${admin?'Administración':'Técnico instalador'}${isAdminUser()?`<button type="button" class="button light small mode-switch" data-switch-mode>${admin?'🔧 Cambiar a Instalador':'📊 Volver a Dirección'}</button>`:''}<button class="button small" id="logout">Cerrar sesión</button></div></aside><header class="header-mobile"><div class="brand"><span class="brand-logo">A</span> ASSA Instalaciones</div><div class="mobile-mode-actions">${isAdminUser()?`<button type="button" class="button light small mode-switch" data-switch-mode>${admin?'🔧 Instalador':'📊 Dirección'}</button>`:''}<button id="logoutMobile">Salir</button></div></header><main class="main">${content}</main><nav class="bottom-nav">${bottom}</nav></div>`;
 el.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.nav).catch(e=>toast(e.message,true))));el.querySelectorAll('[data-switch-mode]').forEach(btn=>btn.addEventListener('click',()=>switchWorkMode().catch(e=>toast(e.message,true))));el.querySelectorAll('#logout,#logoutMobile').forEach(btn=>btn.addEventListener('click',logout));
}
async function switchWorkMode(){
 if(!isAdminUser())return;
 if(state.page==='sign'&&!confirm('La firma aún no se ha guardado. ¿Cambiar de modo sin enviarla?'))return;
 const ctx=el.querySelector('#reportForm')?.recovery||el.querySelector('#visitForm')?.recovery;
 if(ctx){if(ctx.saving)return toast('Termina de guardar el parte antes de cambiar de modo.',true);await ctx.ready;await ctx.photoTask;const ok=await ctx.persist();if(!ok)return toast('No se pudo conservar el borrador. Guarda el parte antes de cambiar de modo.',true);}
 state.viewMode=state.viewMode==='instalador'?'direccion':'instalador';state.showAllTechnicianJobs=false;state.agendaTech='';state.agendaPartner='';state.search='';state.status='active';state.newAppointment=false;
 await navigate('today');
}
async function init(){try{const result=await api('/me');state.me=result.user;state.page='today';await loadJobs();render();}catch{showLogin();}}
function showLogin(){el.innerHTML=`<div class="login-scene"><div class="login-art"><div class="brand"><span class="brand-logo">A</span> ASSA Instalaciones</div><div><h1>Todo el trabajo.<br>En un solo lugar.</h1><p>Visitas, partes de trabajo y seguimiento del equipo, organizados y conectados con ASSA.</p></div><div class="art-foot">Portal privado de empleados · Cambrils</div></div><div class="login-panel"><div class="login-card"><span class="eyebrow">Acceso exclusivo</span><h2>Bienvenido al equipo</h2><p class="muted">Accede con las credenciales facilitadas por ASSA.</p><form id="loginForm">${field('username','Usuario','','text','autocomplete="username" required autofocus')}${field('password','Contraseña','','password','autocomplete="current-password" required')}<button class="button primary full" type="submit">Entrar al portal</button></form><div class="hint">¿No tienes acceso? Pide tu usuario a administración.</div></div></div></div>`;
 document.querySelector('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');busy(btn,true);try{const result=await api('/login','POST',formData(e.target));state.me=result.user;state.page='today';await loadJobs();render();}catch(err){toast(err.message,true);}finally{busy(btn,false);}});
}
async function logout(){state.viewMode='direccion';state.showAllTechnicianJobs=false;for(const ctx of draftSessions)ctx.cancelled=true;await Promise.allSettled([...draftSessions].map(async ctx=>{await ctx.ready;await ctx.photoTask;await ctx.queue;}));draftSessions.clear();await clearUserDrafts(state.me?.username||'').catch(()=>{});await api('/logout','POST').catch(()=>{});state.me=null;showLogin();}
async function loadDashboard(){const [dashboard,review,results]=await Promise.all([api('/admin/dashboard'),api('/admin/closures'),api('/admin/outcomes')]);state.outcomeRequests=results.requests;state.canDecideOutcomes=results.canDecide;state.dashboard=dashboard;state.closures=review.closures;state.canApprove=review.canApprove;}
async function loadReconciliation(){state.reconciliation=await api('/admin/reconciliation');}
async function loadJobs(){state.jobs=(await api('/jobs')).jobs;}
async function loadAgendaNotes(){state.agendaNotes=(await api('/agenda-notes')).notes;}
async function navigate(page){state.page=page;state.job=null;state.savedVisit=null;if(page==='today'||page==='jobs'||page==='agenda'||page==='visits')await loadJobs();if(page==='agenda'&&state.me.role==='administrador'){const [team,clients,partners,notes]=await Promise.all([api('/employees'),api('/clients'),api('/collaborators'),api('/agenda-notes')]);state.employees=team.employees;state.clients=clients.clients;state.partners=partners.collaborators;state.agendaNotes=notes.notes;}if(page==='dashboard')await loadDashboard();if(page==='reconciliation')await loadReconciliation();if(page==='users'){try{state.employees=(await api('/employees')).employees;}catch(e){toast(e.message,true);}}render();}
function render(){if(state.page==='today')renderToday();else if(state.page==='partnerCounts')renderPartnerCounts();else if(state.page==='agenda')renderAgenda();else if(state.page==='dashboard')renderDashboard();else if(state.page==='reconciliation')renderReconciliation();else if(state.page==='jobs')renderJobs();else if(state.page==='work')renderWork();else if(state.page==='visits')renderVisits();else if(state.page==='users')renderUsers();else if(state.page==='sign')renderSign();else if(state.page==='signedDone')renderSignedDone();else if(state.page==='otDetails')renderOTDetails();else if(state.page==='directionEdit')renderDirectionEdit();}

function renderReconciliation(){
  if(state.me?.role!=='administrador')return navigate('jobs');
  const data=state.reconciliation;
  if(!data)return layout('<section class="panel"><h2>Conciliación no disponible</h2><p>Entra de nuevo en Conciliación para consultar el índice de Airtable.</p></section>');
  const rows=data.rows||[],counts=data.counts||{},query=(state.reconciliationSearch||'').toLocaleLowerCase('es');
  const filters=[{value:'review',label:'Para revisar'},{value:'matched',label:'Coincidencias documentales'},{value:'resolved',label:'Revisadas'},{value:'all',label:'Todos'}];
  const shown=rows.filter(r=>(state.reconciliationFilter==='all'||(state.reconciliationFilter==='review'?r.reviewRequired:state.reconciliationFilter==='resolved'?r.decision!=='Pendiente':r.result==='Coincidencia documental'&&r.decision==='Pendiente'))&&
    [r.client,r.fiscalClient,r.work,r.invoice,r.reviewType].join(' ').toLocaleLowerCase('es').includes(query));
  const money=n=>typeof n==='number'?n.toLocaleString('es-ES',{style:'currency',currency:'EUR'}):'Sin importe';
  layout(`<div class="topbar"><div class="titleblock"><span class="eyebrow">Solo administración ASSA</span>
     <h1>Conciliación documental</h1><p>Facturas de Drive comparadas con clientes y trabajos de Airtable.</p></div><span class="chip">Piloto · Validación documental</span></div>
     <section class="dash-kpis recon-kpis">
       <div class="dash-kpi"><span>Facturas encontradas</span><strong>${Number(counts.proposals||0)}</strong></div>
       <div class="dash-kpi"><span>Archivos en el índice</span><strong>${Number(counts.documentFiles||0)}</strong></div>
       <div class="dash-kpi"><span>Coincidencias documentales</span><strong>${Number(counts.documentaryMatches||0)}</strong></div>
       <div class="dash-kpi"><span>Para revisar</span><strong>${Number(counts.reviewNeeded||0)}</strong></div>
       <div class="dash-kpi"><span>Copias duplicadas</span><strong>${Number(counts.duplicateFiles||0)}</strong></div>
     </section>
     <div class="pale dash-disclaimer"><strong>La factura localizada no significa cobro verificado.</strong>
       Las decisiones solo se guardan en la tabla de propuestas de Airtable. Ninguna factura, ficha de cliente, envío ni importe cobrado se modifica aquí.
       <strong>${Number(counts.bankVerified||0)} cobros</strong> tienen justificante independiente contrastado en este piloto.</div>
     <div class="section-head"><h2>Documentos y coincidencias</h2><button class="button small light" type="button" id="reconRefresh">↻ Actualizar</button></div>
     <div class="tabs dash-tabs">${filters.map(t=>`<button type="button" class="tab ${state.reconciliationFilter===t.value?'active':''}" data-recon-filter="${h(t.value)}">${h(t.label)}</button>`).join('')}</div>
     <div class="toolbar"><input id="reconSearch" placeholder="Buscar factura, cliente o trabajo" aria-label="Buscar conciliación" value="${h(state.reconciliationSearch)}"></div>
     <div class="dash-list">${shown.length?shown.map(r=>`<article class="dash-job">
       <div class="dash-job-top"><div><div class="ref">Factura ${h(r.invoice)}</div><h3>${h(r.client)}</h3>
         <p class="smalltext">${h(r.work)}</p></div><span class="dash-amount">${h(money(r.amount))}<small>Total factura original</small></span></div>
       <div class="dash-tags">
         <span class="dash-tag ${r.reviewRequired?'warn':'ok'}">${h(r.result)}</span>
         ${r.reviewType?`<span class="dash-tag neutral">${h(r.reviewType)}</span>`:''}
         ${r.decision!=='Pendiente'?`<span class="dash-tag ${r.decision==='Descartada'?'warn':'ok'}">${h(r.decision)}</span>`:''}
       </div>
       <div class="dash-finance"><span>Cliente en factura: <strong>${h(r.fiscalClient||'No identificado')}</strong></span>
         <span>Envío: <strong>${h(r.delivery)}</strong></span>
         <span>Cobro: <strong>${h(r.payment)}</strong></span></div>
       <div class="pale recon-reason"><strong>Comprobación:</strong> ${h(r.why)}</div>
       ${r.reviewedBy?`<p class="smalltext">Revisado por ${h(r.reviewedBy)}${r.reviewedAt?" · "+h(r.reviewedAt.slice(0,16)):""}</p>`:""}
       <div class="dash-card-actions">
         ${r.url?`<a class="button small light" href="${h(r.url)}" target="_blank" rel="noopener noreferrer">📄 Ver factura original</a>`:''}
         ${r.workId?`<button type="button" class="button small ghost" data-recon-work="${h(r.workId)}">Ver trabajo</button>`:''}
         ${r.reviewRequired?`<button type="button" class="button small primary" data-recon-decision="Validada sin aplicar" data-id="${h(r.id)}">Validar coincidencia</button><button type="button" class="button small ghost" data-recon-decision="Descartada" data-id="${h(r.id)}">Descartar</button>`:''}
       </div>
     </article>`).join(''):'<div class="empty"><h3>Sin propuestas en este filtro</h3><p>Prueba otra categoría o cambia la búsqueda.</p></div>'}</div>
     <p class="smalltext dash-disclaimer-bottom">Fuentes: Airtable y documentos existentes de Google Drive. Las decisiones validadas no se aplican automáticamente al CRM. No hay sincronización periódica de Drive ni cierre automático de cobros activo.</p>`);
  el.querySelector('#reconRefresh').addEventListener('click',async ev=>{
    const btn=ev.currentTarget;busy(btn,true);
    try{await loadReconciliation();renderReconciliation();toast('Conciliación actualizada desde Airtable.');}
    catch(err){toast(err.message,true);busy(btn,false);}
  });
  el.querySelectorAll('[data-recon-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    state.reconciliationFilter=btn.dataset.reconFilter;renderReconciliation();
  }));
  el.querySelector('#reconSearch').addEventListener('input',ev=>{
    state.reconciliationSearch=ev.target.value;const cursor=ev.target.selectionStart;
    renderReconciliation();const input=el.querySelector('#reconSearch');input.focus();input.setSelectionRange(cursor,cursor);
  });
  el.querySelectorAll('[data-recon-work]').forEach(btn=>btn.addEventListener('click',()=>openJob(btn.dataset.reconWork)));
  el.querySelectorAll('[data-recon-decision]').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=btn.dataset.id,decision=btn.dataset.reconDecision;
    const row=(state.reconciliation?.rows||[]).find(x=>x.id===id);
    if(!row||!row.reviewRequired)return toast('La propuesta ya se ha revisado.',true);
    const message=decision==='Validada sin aplicar'
      ?'¿Validar documentalmente la coincidencia de la factura '+row.invoice+'? Se guardará tu decisión, pero NO cambiará datos de clientes, facturas ni cobros.'
      :'¿Descartar esta propuesta de la factura '+row.invoice+'? El documento original seguirá guardado y no se modificarán datos financieros.';
    if(!confirm(message))return;
    busy(btn,true);
    try{
      const result=await api('/admin/reconciliation/'+id+'/decision','PATCH',{decision});
      await loadReconciliation();renderReconciliation();
      toast(result.notice||'Decisión documental guardada.');
    }catch(err){toast(err.message,true);busy(btn,false);}
  }));
}
function renderDashboard(){
  if(state.me?.role!=='administrador')return navigate('jobs');
  const data=state.dashboard;if(!data)return layout('<section class="panel"><h2>No hay datos cargados</h2><p>Vuelve a entrar en Dirección para consultar Airtable.</p></section>');
  const counts=data.counts||{},rows=data.rows||[],scope=data.scope||{};
  const money=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('es-ES',{style:'currency',currency:'EUR'}):'No confirmado';
  const filters=[
    {key:'review',label:'Necesitan revisión'},
    {key:'active',label:'Activos'},
    {key:'unsigned',label:'Sin OT firmada'},
    {key:'noInvoice',label:'Sin referencia de factura'},
    {key:'incomplete',label:'Fichas por completar'},
    {key:'invoice',label:'Envío por confirmar'},
    {key:'payment',label:'Por cobrar'},
    {key:'noWork',label:'Cerrados sin ejecución'},
    {key:'closed',label:'Cerrados y cobrados'},
    {key:'all',label:'Todos'}
  ];
  const predicate={
    review:r=>r.needsReview,active:r=>r.active,unsigned:r=>r.needsSignature,
    noInvoice:r=>r.noInvoiceEvidence,incomplete:r=>r.dataIncomplete,invoice:r=>r.needsInvoice,
    payment:r=>r.needsPayment,noWork:r=>r.closedWithoutWork,closed:r=>r.closed,all:r=>true
  }[state.dashboardFilter]||(()=>true);
  const search=(state.dashboardSearch||'').toLocaleLowerCase('es');
  const shown=rows.filter(r=>predicate(r)&&`${r.reference} ${r.client} ${r.address} ${r.invoiceRef}`.toLocaleLowerCase('es').includes(search));
  const stats=[
    {label:'Trabajos activos',value:counts.active||0,kind:'active'},
    {label:'Sin firma registrada',value:counts.unsigned||0,kind:'unsigned'},
    {label:'Facturas sin referencia',value:counts.missingInvoice||0,kind:'noInvoice'},
    {label:'Fichas incompletas',value:counts.incomplete||0,kind:'incomplete'},
    {label:'Por cobrar',value:counts.paymentPending||0,kind:'payment'},
    {label:'Revisión pendiente',value:counts.needsReview||0,kind:'review'},
    {label:'Cerrados sin ejecución',value:counts.closedWithoutWork||0,kind:'noWork'},
    {label:'Cerrados y cobrados',value:counts.closed||0,kind:'closed'}
  ];
  const kindState=r=>{
    const badges=[];if(r.outcome)badges.push('<span class="dash-tag neutral">'+h(r.outcome)+'</span>');
    if(r.closed)badges.push('<span class="dash-tag ok">Cerrado · cobrado</span>');
    if(r.signed)badges.push('<span class="dash-tag ok">OT firmada</span>');
    else if(r.needsSignature)badges.push('<span class="dash-tag warn">Firma pendiente en trabajo activo</span>');
    else if(r.hasArchivedUnsignedOt&&!r.closed)badges.push('<span class="dash-tag neutral">OT histórica sin firma digital vinculada</span>');
    if(r.invoiceSent)badges.push('<span class="dash-tag ok">Envío confirmado</span>');
    else if(r.invoiceRef)badges.push(`<span class="dash-tag neutral">${r.closed?'Factura registrada':'Factura registrada · envío no verificado'}</span>`);
    else if(r.noInvoiceEvidence)badges.push('<span class="dash-tag warn">Factura sin vincular en Airtable</span>');
    else if(r.nonBillable)badges.push('<span class="dash-tag neutral">Intervención sin cargo</span>');
    if(r.paymentConfirmed)badges.push(`<span class="dash-tag ${r.paymentNeedsReconcile?'warn':'ok'}">Cobro verificado${r.paymentNeedsReconcile?' · conciliar':''}</span>`);
    else if(r.paidInCrm)badges.push('<span class="dash-tag ok">Cobrado según CRM</span>');
    else if(r.paidReported)badges.push('<span class="dash-tag neutral">Pagado según seguimiento · sin conciliar</span>');
    else if(r.needsPayment)badges.push('<span class="dash-tag warn">Cobro pendiente en CRM</span>');
    if(r.dataIncomplete)badges.push('<span class="dash-tag neutral">Datos por completar</span>');
    return badges.join('');
  };
  layout(`${outcomeReviewPanel()}${closurePanel()}<div class="section-head"><button class="button primary" id="partnerCountsBtn">Recuento para factura de colaboradores</button></div><div class="topbar"><div class="titleblock"><span class="eyebrow">Solo administración ASSA</span><h1>Panel de dirección</h1><p>Seguimiento de trabajos, órdenes firmadas, facturas y cobros registrados en Airtable.</p></div><span class="chip">● Datos de Airtable</span></div>
    <section class="dash-kpis">${stats.map(x=>`<button type="button" class="dash-kpi ${state.dashboardFilter===x.kind?'selected':''}" data-dash-filter="${x.kind}"><span>${h(x.label)}</span><strong>${Number(x.value)}</strong></button>`).join('')}</section>
    <div class="pale dash-disclaimer">Se han revisado <strong>${Number(scope.operational||0)} trabajos operativos</strong>. Se excluyen ${Number(scope.unclassified||0)} registros históricos sin estado y ${Number(scope.excludedTests||0)} pruebas. «Sin referencia de factura» o «sin OT firmada» significa <strong>que el documento no está vinculado en estas tablas</strong>, no que no exista o no haya sido enviado. Un cobro anotado en observaciones no es conciliación bancaria.</div>
    <div class="section-head"><h2>Trabajos para revisar</h2><button class="button small light" id="dashRefresh">↻ Actualizar</button></div>
    <div class="tabs dash-tabs">${filters.map(x=>`<button type="button" class="tab ${state.dashboardFilter===x.key?'active':''}" data-dash-filter="${x.key}">${h(x.label)}</button>`).join('')}</div>
    <div class="toolbar"><input id="dashSearch" aria-label="Buscar en el panel" placeholder="Buscar cliente, trabajo o factura" value="${h(state.dashboardSearch)}"></div>
    <div class="dash-list">${shown.length?shown.map(r=>`<article class="dash-job">
      <div class="dash-job-top"><div><div class="ref">${h(r.reference||'Trabajo ASSA')}</div><h3>${h(r.client||'Cliente no indicado')}</h3><p class="smalltext">📍 ${h(r.address||'Dirección no registrada')}${r.addressFromClient?' (domicilio del cliente, no ubicación verificada de intervención)':''} · ${h(r.status)}${r.date?' · 📅 '+h(r.date):''}</p></div><span class="dash-amount">${h(money(r.total))}<small>Importe registrado</small></span></div>
      <div class="dash-tags">${kindState(r)}</div>
      <div class="dash-finance"><span>Factura: <strong>${h(r.invoiceRef||'Sin referencia')}</strong></span><span>Cobrado en CRM: <strong>${h(money(r.paid))}</strong></span>${r.paymentState?`<span>Estado CRM: <strong>${h(r.paymentState)}</strong></span>`:''}${r.otNumber?`<span>OT: <strong>${h(r.otNumber)}</strong></span>`:''}</div>
      ${r.anomalies?.length?`<div class="warning">${r.anomalies.map(a=>h(a)).join(' · ')}</div>`:''}
      ${r.dataIncomplete?`<p class="smalltext dash-incomplete"><strong>Datos por completar:</strong> ${h(r.missingData.join(' · '))}</p>`:''}
      ${r.closed?'<div class="dash-controls"><span class="dash-payment-ok">✓ Expediente cerrado: factura vinculada e importe cobrado registrado en Airtable</span></div>':`<div class="dash-controls"><label><input type="checkbox" disabled data-dashboard-confirm="invoiceSent" data-id="${h(r.id)}" ${r.invoiceSent?'checked':''}> Envío de factura confirmado</label>${r.paidInCrm?'<span class="dash-payment-ok">✓ Cobro registrado en CRM; no hace falta marcarlo otra vez</span>':`<label><input type="checkbox" disabled data-dashboard-confirm="paymentConfirmed" data-id="${h(r.id)}" ${r.paymentConfirmed?'checked':''}> Cobro confirmado</label>`}</div>`}
      <div class="dash-card-actions"><button type="button" class="button small light" data-open-dashboard="${h(r.id)}">Ver trabajo</button>${r.signedPdf?`<a class="button small ghost" href="${h(r.signedPdf)}" target="_blank" rel="noopener noreferrer">📄 OT firmada</a>`:''}</div>
    </article>`).join(''):'<div class="empty"><div class="symbol">✓</div><h3>No hay trabajos en este filtro</h3><p>Prueba con otra categoría o modifica la búsqueda.</p></div>'}</div>
    <p class="smalltext dash-disclaimer-bottom">Las confirmaciones de facturas y cobros se muestran en modo consulta y están protegidas en esta entrega.</p>`);
  bindClosures();bindOutcomeReview();el.querySelector('#partnerCountsBtn').addEventListener('click',()=>openPartnerCounts().catch(e=>toast(e.message,true)));
  el.querySelector('#dashRefresh').addEventListener('click',async e=>{busy(e.target,true);try{await loadDashboard();renderDashboard();toast('Panel actualizado desde Airtable.');}catch(err){toast(err.message,true);}finally{busy(e.target,false);}});
  el.querySelectorAll('[data-dash-filter]').forEach(b=>b.addEventListener('click',()=>{state.dashboardFilter=b.dataset.dashFilter;renderDashboard();}));
  el.querySelector('#dashSearch').addEventListener('input',e=>{state.dashboardSearch=e.target.value;const pos=e.target.selectionStart;renderDashboard();const input=el.querySelector('#dashSearch');input.focus();input.setSelectionRange(pos,pos);});
  el.querySelectorAll('[data-open-dashboard]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.openDashboard)));
  el.querySelectorAll('[data-dashboard-confirm]').forEach(input=>input.addEventListener('change',async e=>{
    const field=e.target.dataset.dashboardConfirm,id=e.target.dataset.id,checked=e.target.checked;
    const r=(state.dashboard.rows||[]).find(x=>x.id===id);
    let message=field==='invoiceSent'?'Confirmar que ya has enviado la factura al cliente. No se genera ni envía una factura desde aquí.':'Confirmar manualmente que el cliente ha pagado. Este control NO actualiza el importe cobrado ni modifica la factura.';
    if(field==='invoiceSent'&&checked&&!r?.invoiceRef)message+=' ATENCIÓN: en Airtable todavía no consta una referencia de factura.';
    if(field==='paymentConfirmed'&&checked&&!r?.paidInCrm)message+=' ATENCIÓN: el cobro todavía no está conciliado con los importes registrados.';
    if(!checked)message='¿Quieres retirar esta confirmación administrativa? Los datos originales de facturación y cobro permanecerán intactos.';
    if(!confirm(message)){e.target.checked=!checked;return;}
    e.target.disabled=true;
    try{
      const result=await api(`/admin/jobs/${id}/confirm`,'PATCH',{field,checked});
      await loadDashboard();renderDashboard();toast(result.notice||'Control guardado en Airtable.');
    }catch(err){e.target.checked=!checked;e.target.disabled=false;toast(err.message,true);}
  }));
}
function closurePanel(){
 return '<section class="panel"><div class="section-head"><h2>Cierres pendientes de Samuel</h2><span class="chip">'+state.closures.length+'</span></div><p class="muted">Revisa horas, materiales, observaciones, fotos y PDF firmado antes de aprobar.</p>'+ (state.closures.length?state.closures.map(c=>`<article class="report"><strong>${h(c.job?.client||'Trabajo no localizado')}</strong><p>${h(c.job?.reference)} · ${h(c.number)} · ${h(c.event.submittedBy)}</p><p>${c.signed?'Parte firmado y archivado':'Firma incompleta: volver al trabajo para recuperar el guardado'}</p><div class="actions">${c.job?`<button class="button small light" data-review-open="${h(c.job.id)}">Revisar trabajo y parte</button>`:''}${state.canApprove&&c.signed&&c.job?`<button class="button small primary" data-approve-job="${h(c.job.id)}" data-order="${h(c.id)}">Aprobar cierre</button>`:''}</div></article>`).join(''):'<p>No hay cierres pendientes en el nuevo flujo.</p>')+'</section>';
}
function bindClosures(){
 el.querySelectorAll('[data-review-open]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.reviewOpen)));
 el.querySelectorAll('[data-approve-job]').forEach(b=>b.addEventListener('click',async()=>{
  if(!confirm('¿Confirmas que has revisado el parte y apruebas el cierre? El trabajo pasará a Terminado.'))return;
  busy(b,true);try{await api('/jobs/'+b.dataset.approveJob+'/approve-closure','POST',{orderId:b.dataset.order});await loadDashboard();renderDashboard();toast('Cierre aprobado por Samuel.');}catch(e){toast(e.message,true);busy(b,false);}
 }));
}
function renderAgenda(){
 const admin=isDirectionMode(),today=madridToday();
 const team=admin?state.employees.filter(e=>e.active&&e.role==='tecnico'):[{username:state.me.username,name:state.me.name}];
 const jobs=state.jobs.filter(operationalJob).filter(technicianJobVisible).filter(j=>j.date&&(!state.agendaPartner||j.partnerId===state.agendaPartner)&&(!state.agendaTech||(state.agendaTech==='unassigned'?!j.assigned.trim():assignedUsers(j.assigned).includes(state.agendaTech)))&&(state.agendaShowCancelled||j.status!=='Cancelado'));
 const dayJobs=jobs.filter(j=>j.date===state.agendaDate).sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
 const freeNotes=admin&&!state.agendaPartner&&!state.agendaTech?state.agendaNotes.filter(n=>state.agendaShowCancelled||n.status!=='Cancelada'):[];
 const dayNotes=freeNotes.filter(n=>n.date===state.agendaDate).sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
 const monthLabel=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(state.agendaMonth+'-01T12:00:00Z'));
 const withoutDate=state.jobs.filter(operationalJob).filter(technicianJobVisible).filter(j=>OPEN_STATUSES.includes(j.status)&&!j.date);
 layout(`<div class="topbar"><div class="titleblock"><span class="eyebrow">${admin?'Dirección ASSA':'Mi planificación'}</span><h1>Agenda ASSA</h1><p>Trabajos, citas y recordatorios · horarios de Europe/Madrid</p></div>${admin?'<button class="button primary" id="newAppointment">+ Añadir a la agenda</button>':''}</div>
 <section class="panel calendar-panel"><div class="calendar-toolbar"><button class="button light small" id="previousMonth" aria-label="Mes anterior">←</button><h2>${h(monthLabel)}</h2><button class="button light small" id="nextMonth" aria-label="Mes siguiente">→</button><button class="button ghost small" id="calendarToday">Hoy</button></div>
 <div class="grid2">${field('calendarMonth','Ir al mes',state.agendaMonth,'month')}${admin?select('agendaTech','Ver agenda de',[{value:'unassigned',label:'Sin asignar'},...team.map(e=>({value:e.username,label:e.name||e.username}))],state.agendaTech,'Todo el equipo'):''}</div>
 ${admin?select('agendaPartner','Colaborador que aporta el trabajo',[{value:'other',label:'Otro colaborador / por confirmar'},...state.partners.map(p=>({value:p.id,label:p.name}))],state.agendaPartner,'Todos / cliente directo'):''}
 ${admin?`<label class="check-pill"><input type="checkbox" id="agendaShowCancelled" ${state.agendaShowCancelled?'checked':''}> Mostrar canceladas</label>`:'' }
 <div class="calendar-weekdays" aria-hidden="true">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>'<span>'+d+'</span>').join('')}</div>
 <div class="calendar-grid" aria-label="Calendario mensual">${calendarCells(state.agendaMonth).map(cell=>{
  const events=jobs.filter(j=>j.date===cell.date),open=events.filter(j=>OPEN_STATUSES.includes(j.status)),notes=freeNotes.filter(n=>n.date===cell.date),activeNotes=notes.filter(n=>n.status!=='Cancelada');
  return `<button type="button" class="calendar-day ${cell.inMonth?'':'other-month'} ${cell.date===state.agendaDate?'selected':''} ${cell.date===today?'today':''} ${open.length||activeNotes.length?'occupied':''}" data-calendar-date="${cell.date}" aria-pressed="${cell.date===state.agendaDate}" aria-label="${cell.date}: ${open.length} trabajos abiertos, ${notes.length} citas libres"><span class="calendar-day-number">${cell.day}</span>${[...events.map(j=>`<span class="calendar-event ${OPEN_STATUSES.includes(j.status)?'':'completed'}">${h(j.start||'Sin hora')} ${h(j.client||j.reference)}</span>`),...notes.map(n=>`<span class="calendar-event ${n.status==='Cancelada'?'completed':''}">${h(n.start||'📝')} ${h(n.title)}${n.status==='Cancelada'?' (cancelada)':''}</span>`)].slice(0,2).join('')}${events.length+notes.length>2?'<span class="calendar-more">+'+(events.length+notes.length-2)+' más</span>':''}${open.length?'<span class="calendar-count">'+open.length+' ocup.</span>':''}</button>`;
 }).join('')}</div><p class="smalltext">Los días resaltados tienen trabajos o anotaciones. Las citas libres no bloquean técnicos. Un día sin reservas no confirma por sí solo la disponibilidad del equipo.</p></section>
 <section class="panel" id="calendarDay"><div class="section-head"><h2>${h(new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(state.agendaDate+'T12:00:00Z')))}</h2>${admin?'<button class="button small primary" id="addForDay">+ Añadir aquí</button>':''}</div>
 ${dayJobs.length?dayJobs.map(j=>`<article class="report calendar-appointment"><div class="calendar-time">${h(j.start?j.start+(j.end?'–'+j.end:' · fin pendiente'):'Hora pendiente')}</div><div><h3>${h(j.client||'Cliente pendiente')}</h3><p>${h(j.description||j.reference)} · ${h(j.status)}</p><p>👷 ${h(j.assigned||'Sin asignar')} · 📍 ${h(j.address||'Dirección pendiente')}</p>${relationshipSummary(j)}${jobContactActions(j,true)}<button class="button small light" data-agenda-job="${h(j.id)}">${admin?'Ver / cambiar cita':'Ver trabajo'}</button>${admin&&state.me.canManageRecords&&(j.status==='Cancelado'||['Aceptado / Programado','Pendiente de visita'].includes(j.status))?`<button type="button" class="button small ${j.status==='Cancelado'?'light':'danger'}" data-agenda-work-action="${j.status==='Cancelado'?'restore':'cancel'}" data-id="${h(j.id)}">${j.status==='Cancelado'?'↩ Recuperar cita':'Cancelar cita'}</button>`:''}</div></article>`).join(''):'<p>No hay instalaciones registradas este día.</p>'}${dayNotes.map(n=>`<article class="report calendar-appointment"><div class="calendar-time">${h(n.start?n.start+(n.end?'–'+n.end:''):'Sin hora')}</div><div><h3>📝 ${h(n.title)}</h3><p>${h(n.kind)}${n.location?' · 📍 '+h(n.location):''}</p>${n.notes?`<p>${h(n.notes)}</p>`:''}${n.status==='Cancelada'?'<p><strong>Cancelada</strong></p>':''}${admin&&state.me.canManageRecords?`<button type="button" class="button small ${n.status==='Cancelada'?'light':'danger'}" data-agenda-note-action="${n.status==='Cancelada'?'restore':'cancel'}" data-id="${h(n.id)}">${n.status==='Cancelada'?'↩ Recuperar cita':'Cancelar cita'}</button>`:''}</div></article>`).join('')}
 <div class="calendar-availability"><h3>Franjas sin reservas entre las 08:00 y las 18:00</h3><p class="smalltext">Orientación según trabajos registrados; comprueba desplazamientos, descansos y disponibilidad real antes de confirmar al cliente.</p>${team.filter(e=>!state.agendaTech||state.agendaTech===e.username).map(e=>{const available=dailyGaps(state.jobs.filter(j=>j.date===state.agendaDate),e.username);return '<p><strong>'+h(e.name||e.username)+':</strong> '+(available.unknown?'Pendiente de comprobar: hay trabajos sin horario.':available.gaps.map(g=>h(g.start+'–'+g.end)).join(' · ')||'Sin franjas libres registradas')+'</p>';}).join('')}</div></section>
 ${admin&&state.newAppointment?`<section class="panel"><div class="actions"><button class="button ${state.newAppointmentMode==='free'?'primary':'light'}" id="agendaModeFree" type="button">📝 Cita libre / recordatorio</button><button class="button ${state.newAppointmentMode==='work'?'primary':'light'}" id="agendaModeWork" type="button">🔧 Instalación / visita técnica</button></div></section>`:''}
 ${admin&&state.newAppointment?(state.newAppointmentMode==='work'?appointmentForm(team):freeAppointmentForm()):''}
 ${withoutDate.length?`<section class="panel"><h2>Sin fecha prevista · ${withoutDate.length}</h2>${withoutDate.map(j=>`<p><button class="button ghost small" data-agenda-job="${h(j.id)}">${h(j.client||j.reference)} · ${h(j.assigned||'Sin asignar')}</button></p>`).join('')}</section>`:''}`);
 const move=delta=>{state.agendaMonth=shiftMonth(state.agendaMonth,delta);state.agendaDate=state.agendaMonth+'-01';state.newAppointment=false;renderAgenda();};
 el.querySelector('#previousMonth').addEventListener('click',()=>move(-1));el.querySelector('#nextMonth').addEventListener('click',()=>move(1));
 el.querySelector('#calendarToday').addEventListener('click',()=>{state.agendaDate=today;state.agendaMonth=today.slice(0,7);state.newAppointment=false;renderAgenda();});
 el.querySelector('#calendarMonth').addEventListener('change',e=>{if(!/^\d{4}-\d{2}$/.test(e.target.value))return;state.agendaMonth=e.target.value;state.agendaDate=e.target.value+'-01';state.newAppointment=false;renderAgenda();});
 el.querySelector('#agendaPartner')?.addEventListener('change',e=>{state.agendaPartner=e.target.value;renderAgenda();});
 el.querySelector('#agendaTech')?.addEventListener('change',e=>{state.agendaTech=e.target.value;renderAgenda();});
 el.querySelector('#agendaShowCancelled')?.addEventListener('change',e=>{state.agendaShowCancelled=e.target.checked;renderAgenda();});
 el.querySelectorAll('[data-calendar-date]').forEach(b=>b.addEventListener('click',()=>{state.agendaDate=b.dataset.calendarDate;state.agendaMonth=state.agendaDate.slice(0,7);state.newAppointment=false;renderAgenda();el.querySelector('#calendarDay')?.scrollIntoView({behavior:'smooth',block:'start'});}));
 const showForm=()=>{state.newAppointment=true;state.newAppointmentMode='free';state.newAppointmentId=crypto.randomUUID();renderAgenda();el.querySelector('#appointmentForm,#freeAppointmentForm')?.scrollIntoView({behavior:'smooth',block:'start'});};
 el.querySelector('#newAppointment')?.addEventListener('click',showForm);el.querySelector('#addForDay')?.addEventListener('click',showForm);
 el.querySelectorAll('[data-agenda-job]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.agendaJob)));
 el.querySelectorAll('[data-agenda-work-action]').forEach(button=>button.addEventListener('click',async()=>{
  const job=state.jobs.find(j=>j.id===button.dataset.id),action=button.dataset.agendaWorkAction;
  if(!job||!['cancel','restore'].includes(action))return;
  if(!confirm(action==='cancel'?'¿Cancelar esta cita? Se ocultará en la agenda habitual, conservando el trabajo y su historial.':'¿Recuperar esta cita? Se comprobará si el técnico sigue disponible.'))return;
  busy(button,true);try{
   const result=await api('/jobs/'+job.id+'/agenda-state','PATCH',{action,operationId:crypto.randomUUID(),expected:{status:job.status,outcome:job.outcome||''}});
   await loadJobs();renderAgenda();toast(result.warnings?.join(' ')||result.notice||'Cita actualizada.');
  }catch(err){toast(err.message,true);busy(button,false);}
 }));
 el.querySelectorAll('[data-agenda-note-action]').forEach(button=>button.addEventListener('click',async()=>{
  const note=state.agendaNotes.find(n=>n.id===button.dataset.id),action=button.dataset.agendaNoteAction;
  if(!note||!['cancel','restore'].includes(action))return;
  if(!confirm(action==='cancel'?'¿Cancelar esta cita libre? Se conservará en el historial.':'¿Recuperar esta cita libre?'))return;
  busy(button,true);try{
   const result=await api('/agenda-notes/'+note.id+'/state','PATCH',{action,operationId:crypto.randomUUID(),expectedStatus:note.status||'Activa'});
   await loadAgendaNotes();renderAgenda();toast(result.notice||'Cita actualizada.');
  }catch(err){toast(err.message,true);busy(button,false);}
 }));
 if(admin&&state.newAppointment){el.querySelector('#agendaModeFree')?.addEventListener('click',()=>{state.newAppointmentMode='free';renderAgenda();});el.querySelector('#agendaModeWork')?.addEventListener('click',()=>{state.newAppointmentMode='work';renderAgenda();});if(state.newAppointmentMode==='work')bindAppointmentForm();else bindFreeAppointmentForm();}
}
function freeAppointmentForm(){
 return `<section class="panel"><h2>Añadir cita libre</h2><p class="smalltext">No hace falta cliente, intermediario ni técnico. Solo se muestra en la agenda de administración.</p><form id="freeAppointmentForm">${field('freeTitle','Título o persona','','text','maxlength="160" required')}${select('freeKind','Tipo',[{value:'Cita libre',label:'Cita libre'},{value:'Visita informal',label:'Visita informal'},{value:'Reunión',label:'Reunión'},{value:'Recordatorio',label:'Recordatorio'}],'Cita libre')}<div class="grid2">${field('freeDate','Fecha',state.agendaDate,'date','required')}${field('freeStart','Hora · opcional','','time')}</div><div class="grid2">${field('freeEnd','Fin · opcional','','time')}${field('freeLocation','Lugar · opcional','','text','maxlength="220"')}</div>${area('freeNotes','Observaciones · opcional','','Detalles para recordar...')}<div class="actions"><button class="button primary" type="submit">Guardar en agenda</button><button class="button ghost" type="button" id="cancelFreeAppointment">Cancelar</button></div></form></section>`;
}
function bindFreeAppointmentForm(){
 el.querySelector('#cancelFreeAppointment').addEventListener('click',()=>{state.newAppointment=false;renderAgenda();});
 const form=el.querySelector('#freeAppointmentForm');
 form.addEventListener('submit',async e=>{
  e.preventDefault();const b=formData(form),btn=form.querySelector('[type=submit]');
  if(!b.freeTitle.trim()||!b.freeDate)return toast('Indica el título y la fecha.',true);
  busy(btn,true);
  try{
   const result=await api('/agenda-notes','POST',{operationId:state.newAppointmentId,title:b.freeTitle,date:b.freeDate,start:b.freeStart,end:b.freeEnd,kind:b.freeKind,location:b.freeLocation,notes:b.freeNotes});
   state.agendaDate=b.freeDate;state.agendaMonth=b.freeDate.slice(0,7);state.agendaTech='';state.agendaPartner='';state.newAppointment=false;
   await loadAgendaNotes();renderAgenda();toast(result.notice||'Cita guardada.');
  }catch(err){toast(err.message,true);}finally{busy(btn,false);}
 });
}
function appointmentForm(team){
 const options=state.jobs.filter(j=>OPEN_STATUSES.includes(j.status)).map(j=>({value:j.id,label:(j.client||'Cliente')+' — '+(j.description||j.reference)}));
 return `<section class="panel"><h2>Añadir instalación al calendario</h2><form id="appointmentForm">${select('appointmentJob','Trabajo',options,'','Nueva instalación / visita')}
 <div id="newAppointmentFields">${select('appointmentBillingMode','Cómo se encarga el trabajo',[{value:'direct',label:'Cliente directo / visita'},{value:'partner',label:'Instalación para colaborador · también reparaciones'}],'direct')}<div id="appointmentCustomerFields">${select('appointmentClient','Cliente',state.clients.map(c=>({value:c.id,label:c.name+' · '+(c.phone||c.address||'Ficha de cliente')})),'','Contacto nuevo / por identificar')}
 <div id="newContactFields"><div class="grid2">${field('appointmentName','Nombre del contacto','','text','maxlength="200"')}${field('appointmentPhone','Teléfono','','tel','maxlength="50"')}</div><p class="smalltext">Si es un contacto nuevo, la cita se guarda sin crear ni fusionar fichas de clientes.</p></div>
 </div><p class="notice" id="partnerInstallationHint" hidden>No necesitas los datos del cliente final. Selecciona el colaborador y añade la dirección; la instalación entrará en su recuento cuando Samuel confirme que está terminada.</p>
 ${field('appointmentUnits','Número de instalaciones','1','number','min="1" max="100" step="1"')}
 ${field('appointmentDescription','Instalación / trabajo a realizar','','text','maxlength="220"')}${field('appointmentAddress','Dirección de la intervención','','text','maxlength="220"')}
 ${relationshipControls('appointment')}
 ${select('appointmentKind','Tipo de cita',[{value:'installation',label:'Instalación acordada'},{value:'visit',label:'Visita técnica'}],'installation')}</div>
 <div class="grid2">${field('appointmentDate','Fecha',state.agendaDate,'date','required')}<div class="grid2">${field('appointmentStart','Hora de entrada','','time','required')}${field('appointmentEnd','Fin previsto · opcional','','time')}</div></div>
 <p><strong>Técnicos asignados</strong></p><div class="switches">${team.map(e=>`<label class="check-pill"><input type="checkbox" class="appointment-tech" value="${h(e.username)}" ${state.agendaTech===e.username?'checked':''}>${h(e.name||e.username)}</label>`).join('')||'<p>Crea primero los accesos de los técnicos en Empleados.</p>'}</div>
 <p class="smalltext">Puedes reservar solo con la entrada. El instalador anotará la salida real en su parte. Sin fin previsto no se puede confirmar cuánto tiempo queda libre.</p><div class="actions"><button class="button primary" type="submit">Guardar en calendario</button><button class="button ghost" type="button" id="cancelAppointment">Cancelar</button></div></form></section>`;
}
function bindAppointmentForm(){
 const form=el.querySelector('#appointmentForm');bindRelationshipControls('appointment');el.querySelector('#appointmentUnits').closest('.form-field').hidden=true;
 el.querySelector('#appointmentBillingMode').addEventListener('change',()=>{const partner=el.querySelector('#appointmentBillingMode').value==='partner';el.querySelector('#appointmentCustomerFields').hidden=partner;el.querySelector('#partnerInstallationHint').hidden=!partner;el.querySelector('#appointmentUnits').closest('.form-field').hidden=!partner;for(const suffix of ['Occupant','OccupantRole','AccessPhone','InvoiceTo','PartnerRole'])el.querySelector('#appointment'+suffix).closest('.form-field').hidden=partner;if(partner){el.querySelector('#appointmentPartnerNote').textContent='No se necesitan datos del cliente final. Puedes elegir Otro y resolver después el colaborador y la facturación.';el.querySelector('#appointmentInvoiceTo').value='';}el.querySelector('#appointmentKind').closest('.form-field').hidden=partner;if(partner){el.querySelector('#appointmentKind').value='installation';el.querySelector('#appointmentPartnerRole').value=el.querySelector('#appointmentPartner').value?'Contratista':'';}el.querySelector('#appointmentPartnerRole').disabled=partner;});
 el.querySelector('#appointmentPartner').addEventListener('change',()=>{if(el.querySelector('#appointmentBillingMode').value==='partner'){el.querySelector('#appointmentPartnerRole').value=el.querySelector('#appointmentPartner').value?'Contratista':'';el.querySelector('#appointmentPartnerNote').textContent=el.querySelector('#appointmentPartner').value==='other'?'Puedes guardar la cita y resolver después el colaborador y la facturación.':'Encargo del colaborador. Confirma con él la facturación antes de emitirla.';}});
 el.querySelector('#cancelAppointment').addEventListener('click',()=>{state.newAppointment=false;renderAgenda();});
 el.querySelector('#appointmentJob').addEventListener('change',e=>{
  el.querySelector('#newAppointmentFields').hidden=!!e.target.value;const job=state.jobs.find(j=>j.id===e.target.value);
  if(job){el.querySelector('#appointmentStart').value=job.start||'';el.querySelector('#appointmentEnd').value=job.end||'';el.querySelectorAll('.appointment-tech').forEach(x=>x.checked=assignedUsers(job.assigned).includes(x.value));}
 });
 el.querySelector('#appointmentClient').addEventListener('change',e=>{const c=state.clients.find(x=>x.id===e.target.value);el.querySelector('#newContactFields').hidden=!!c;if(c)el.querySelector('#appointmentAddress').value=c.address||'';});
 form.addEventListener('submit',async e=>{
  e.preventDefault();const b=formData(form),users=[...el.querySelectorAll('.appointment-tech:checked')].map(x=>x.value),btn=form.querySelector('[type=submit]');
  if(!users.length)return toast('Selecciona al menos un técnico.',true);if(!b.appointmentJob&&b.appointmentBillingMode==='direct'&&el.querySelector('#appointmentPartner').value&&!b.appointmentClient&&!b.appointmentName&&!b.appointmentPhone){el.querySelector('#appointmentBillingMode').focus();el.querySelector('#appointmentBillingMode').scrollIntoView({block:'center'});return toast('Para reservar sin datos del cliente final, selecciona «Instalación para colaborador» en Cómo se encarga el trabajo.',true);}
  if(!confirm('¿Guardar esta cita el '+b.appointmentDate+' a las '+b.appointmentStart+(b.appointmentEnd?' hasta '+b.appointmentEnd:' · sin fin previsto')+' para '+users.join(', ')+'?'))return;
  busy(btn,true);try{
   let result;const job=state.jobs.find(j=>j.id===b.appointmentJob);
   if(job)result=await api('/jobs/'+job.id+'/schedule','PATCH',{date:b.appointmentDate,start:b.appointmentStart,end:b.appointmentEnd,users,expected:{date:job.date,assigned:job.assigned,start:job.start||'',end:job.end||''}});
   else result=await api('/appointments','POST',{operationId:state.newAppointmentId,date:b.appointmentDate,start:b.appointmentStart,end:b.appointmentEnd,users,clientId:b.appointmentClient,name:b.appointmentName,phone:b.appointmentPhone,address:b.appointmentAddress,description:b.appointmentDescription,kind:b.appointmentKind,billingMode:b.appointmentBillingMode,units:b.appointmentUnits,relationships:b.appointmentBillingMode==='partner'?{partnerId:el.querySelector('#appointmentPartner').value,partnerOther:el.querySelector('#appointmentPartnerOther').value,partnerRole:el.querySelector('#appointmentPartner').value==='other'?'':'Contratista'}:relationshipData('appointment')});
   state.agendaDate=b.appointmentDate;state.agendaMonth=b.appointmentDate.slice(0,7);state.newAppointment=false;await loadJobs();renderAgenda();toast(result.warnings?.join(' ')||result.notice||'Cita guardada en el calendario.');
  }catch(err){toast(err.message,true);}finally{busy(btn,false);}
 });
}

function renderJobs(){const isAdmin=isDirectionMode();let jobs=state.jobs.filter(operationalJob).filter(technicianJobVisible).filter(x=>`${x.reference} ${x.client} ${x.address} ${x.description}`.toLowerCase().includes(state.search.toLowerCase()));if(state.status==='active')jobs=jobs.filter(x=>['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status));else jobs=jobs.filter(x=>!['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status));
 const active=state.jobs.filter(operationalJob).filter(technicianJobVisible).filter(x=>['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status)).length;const completed=state.jobs.filter(operationalJob).filter(technicianJobVisible).length-active;
 layout(`<div class="topbar"><div class="titleblock"><span class="eyebrow">Área de ${isAdmin?'administración':'operarios'}</span><h1>Mis trabajos</h1><p>${isAdmin?'Control de los trabajos de ASSA':'Consulta tus trabajos asignados y registra lo realizado'}</p></div><span class="chip">● Conectado</span></div><section class="kpis"><div class="kpi"><span>Activos</span><strong>${active}</strong></div><div class="kpi"><span>${isAdmin?'Otros estados':'Mis trabajos'}</span><strong>${isAdmin?completed:active}</strong></div><div class="kpi"><span>Visitas</span><strong>↗</strong></div></section><div class="section-head"><h2>Listado de trabajos</h2><button class="button small primary" id="newVisit">+ Visita técnica</button></div>${isAdminUser()&&!isAdmin?`<div class="actions"><button type="button" class="button light small" id="toggleTechnicianJobs">${state.showAllTechnicianJobs?'Ver solo mis trabajos':'Ver otros trabajos abiertos'}</button></div>`:''}${isAdmin?`<div class="tabs"><button class="tab ${state.status==='active'?'active':''}" data-tab="active">Activos</button><button class="tab ${state.status==='closed'?'active':''}" data-tab="closed">Otros estados</button></div>`:''}<div class="toolbar"><input id="search" placeholder="Buscar cliente, dirección o referencia" value="${h(state.search)}"/></div><div class="list">${jobs.length?jobs.map(job=>`<article class="job-card"><div><div class="ref">${h(job.reference||'Trabajo ASSA')}</div><h3>${h(job.client||'Cliente sin nombre')}</h3><p>📍 ${h(job.address||'Dirección pendiente')}</p><p>🔧 ${h(job.description||'Sin descripción')}</p><div class="foot"><span class="status ${['Aceptado / Programado','En progreso'].includes(job.status)?'on':'off'}">${h(job.status)}</span>${job.date?`<span class="smalltext">📅 ${h(job.date)}</span>`:''}${isAdmin&&job.assigned?`<span class="smalltext">👷 ${h(job.assigned)}</span>`:''}</div>${jobContactActions(job,true)}</div><button class="button small ${['Terminado','Facturado'].includes(job.status)?'light':'primary'}" data-open="${job.id}">Ver trabajo</button></article>`).join(''):`<div class="empty"><div class="symbol">✓</div><h3>No hay trabajos en este listado</h3><p>${isAdmin?'Cambia el filtro o asigna trabajos a los operarios.':'Cuando te asignen un trabajo, aparecerá aquí.'}</p></div>`}</div>`);
 el.querySelector('#toggleTechnicianJobs')?.addEventListener('click',()=>{state.showAllTechnicianJobs=!state.showAllTechnicianJobs;renderJobs();});el.querySelector('#newVisit').addEventListener('click',()=>navigate('visits'));el.querySelector('#search').addEventListener('input',e=>{state.search=e.target.value;const cursor=e.target.selectionStart;renderJobs();const input=el.querySelector('#search');input.focus();input.setSelectionRange(cursor,cursor);});el.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.status=b.dataset.tab;renderJobs();}));el.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.open)));}
async function openJob(id){try{state.job=(await api(`/jobs/${id}`)).job;state.reports=(await api(`/jobs/${id}/reports`)).reports;state.signedParts=(await api(`/jobs/${id}/signed`)).parts;state.page='work';state.reportDay=madridToday();state.outcomeOperationId=crypto.randomUUID();state.relationshipOperationId=crypto.randomUUID();if(state.me.role==='administrador'){const [team,clients,partners]=await Promise.all([api('/employees'),api('/clients'),api('/collaborators')]);state.employees=team.employees;state.clients=clients.clients;state.partners=partners.collaborators;}render();}catch(e){toast(e.message,true);}}
function renderWork(){const job=state.job;if(!job)return navigate('jobs');const admin=isDirectionMode();const day=state.reportDay||madridToday();const report=dailyReport(state.reports,state.me.username,day)||(admin?state.reports[0]:null);const locked=!admin&&!['Aceptado / Programado','En progreso','Pendiente de visita'].includes(job.status);const signed=state.signedParts[0];const done=admin||!!signed||report?.done||locked;
 const employees=state.employees.filter(x=>x.active&&x.role==='tecnico');if(admin&&isAdminUser()&&!employees.some(x=>x.username===state.me.username))employees.unshift({username:state.me.username,name:'Yo (Dirección)',role:'tecnico',active:true});const assigned=job.assigned.toLowerCase().split(/[,;\n]/).map(x=>x.trim());
 layout(`<button class="button ghost small" id="back">← Volver</button><div class="detail-head"><span class="eyebrow">${h(job.reference||'Trabajo de ASSA')}</span><h1>${h(job.client||'Cliente pendiente')}</h1><span class="status ${['Terminado','Facturado'].includes(job.status)?'off':'on'}">${h(job.status)}</span><div class="details-strip"><span>📍 ${h(job.address)}</span><span>📅 ${h(job.date||'Sin fecha')}</span>${job.phone?`<span>📞 ${h(job.phone)}</span>`:''}</div>${jobContactActions(job)}</div><section class="panel"><h2>Descripción del trabajo</h2><p>${h(job.description||'No se ha añadido descripción.')}</p></section>
 ${job.partnerInstallation?`<section class="panel"><h2>Instalación para ${h(job.partnerName||job.client)}</h2><p>Encargo de colaborador${job.partnerId==='other'?' · colaborador y facturación por confirmar':''} · ${h(job.installationUnits??'Pendientes')} instalación(es).</p><p>Fecha de ejecución: ${h(job.executedOn||'Pendiente de terminar y revisar')}</p>${admin?'<button class="button light small" id="jobPartnerCounts">Ver recuento del colaborador</button>':''}</section>`:''}
 ${relationshipSummary(job)}
 ${admin&&state.me.canManageRecords?renderRelationshipForm(job):''}
 ${admin&&state.me.canManageRecords?`<section class="panel"><h2>Control de dirección</h2><p>Puedes corregir la ficha y los partes del equipo aunque el trabajo esté en otro estado. Cada cambio conserva su motivo e historial.</p><button class="button primary" id="directionEditBtn">Editar trabajo y parte</button></section>`:''}
 ${admin?`<section class='panel'><h2><span class='section-num'>📄</span>Preparación de OT</h2><p class='muted'>Los datos del cliente y el precio aceptado se toman de Airtable. Puedes completar información pendiente antes de la visita o después, sin modificar la firma original.</p><button type='button' class='button small light' id='otDetailsBtn'>Revisar / completar datos OT</button></section>`:''}
 ${admin&&OPEN_STATUSES.includes(job.status)&&!signed?`<section class="panel"><h2><span class="section-num">👷</span>Fecha prevista y técnicos</h2>${field('scheduleDate','Fecha prevista',job.date,'date')}<div class="grid2">${field('scheduleStart','Hora de inicio',job.start||'','time')}${field('scheduleEnd','Fin previsto · opcional',job.end||'','time')}</div><p class="muted">Solo verán los trabajos que les asignes y estén abiertos.</p><div class="switches">${employees.map(u=>`<label class="check-pill"><input type="checkbox" value="${h(u.username)}" class="assign" ${assigned.includes(u.username)?'checked':''}>${h(u.name||u.username)}</label>`).join('')||'No hay operarios. Crea sus cuentas en Empleados.'}</div><div class="actions"><button class="button small primary" id="saveAssign">Guardar planificación</button></div></section>`:''}
 ${admin?economicPanel(job.economics):''}<section class="panel"><h2><span class="section-num">01</span>Parte de ejecución</h2><p class="muted">Anota el trabajo real. Los costes y precios se calculan por separado en Airtable.</p>${done?`<div class="notice">${admin?'Consulta del registro original del técnico. Para corregirlo, utiliza «Editar trabajo y parte».':signed?'Parte firmado conservado; el cierre requiere revisión de Samuel.':'Este parte está finalizado o el trabajo está fuera de ejecución.'}</div>`:''}${!admin&&!signed&&!locked?`<details class="work-optional"><summary>📅 Cambiar fecha de la jornada (si no es hoy)</summary><div class="form-field"><label for="reportDay">Fecha del trabajo</label><input id="reportDay" type="date" value="${h(day)}"/></div></details>`:""}<form id="reportForm">${!admin?`<div class="draft-status" id="draftStatus" role="status">Preparando borrador…</div>`:''} <div class="grid2">${field('hours','Horas reales trabajadas',report?.hours??'','number','step="0.25" min="0" max="24" ' +(done?'disabled':''))}<input type="hidden" id="date" name="date" value="${h(admin?(report?.date||day):day)}"/></div><details class="work-optional"><summary>⏱️ Añadir hora de entrada y salida (opcional)</summary><div class="grid2">${field('actualStart','Entrada real',report?.actualStart||'','time',done?'disabled':'')}${field('actualEnd','Salida real',report?.actualEnd||'','time',done?'disabled':'')}</div><p class="smalltext">El horario real es opcional: registra siempre las horas trabajadas, descontando las pausas.</p></details>${area('material','Material utilizado',report?.material||'','Ejemplo: 2 metros de canaleta\n2 metros de cable\n8 codos de 18\nMedio tubo de 18')}${area('notes','Observaciones del instalador',report?.notes||'','Trabajo realizado, incidencias, pruebas, recomendaciones…')}<div class="form-field"><label for="photos">Fotografías del trabajo</label><input id="photos" type="file" accept="image/*" multiple ${done?'disabled':''}><small>Se comprimirán antes de subirlas a Airtable. No incluyas documentos sensibles.</small></div>${report?.photos?.length?`<div class="gallery">${report.photos.map((p,i)=>`<a href="${h(p.url)}" target="_blank" rel="noopener noreferrer">📷 Foto ${i+1}</a>`).join('')}</div>`:''}<div class="actions"><button type="button" class="button primary" id="finish" ${done?'disabled':''}>${job.partnerInstallation?'✓ Terminar y comunicar a Dirección':'✍️ Terminar y firmar'}</button><button type="submit" class="button light" ${done?'disabled':''}>Guardar sin finalizar</button></div><div class="actions"><a class="button ghost" href="/api/jobs/${job.id}/ot?v=assa-ot-v5-20261104" target="_blank" rel="noopener noreferrer">📄 Ver OT ASSA (nuevo PDF)</a></div></form></section>
 ${admin?renderOutcomeForm(job,admin,signed):`<details class="work-optional"><summary>⚠️ No se ha terminado: comunicar incidencia o siguiente paso</summary>${renderOutcomeForm(job,admin,signed)}</details>`}
 ${renderWorkSigned(signed)}
 ${state.reports.length?`<section class="panel"><h2>Jornadas registradas</h2>${state.reports.map(r=>`<div class="report"><strong>👷 ${h(r.user)}</strong> · ${h(r.date||'Sin fecha')} · ${h(r.hours)} h · ${h(r.actualStart||'Entrada sin indicar')}–${h(r.actualEnd||'Salida sin indicar')} · ${r.done?'Cerrado':'En curso'}<div class="smalltext">${h(r.material||'Sin materiales')}</div><div class="smalltext">${h(r.notes||'Sin observaciones')}</div></div>`).join('')}</section>`:''}`);
 simplifyWorkPanels();
 if(!done){
   const form=el.querySelector('#reportForm');
   bindRecovery(form,draftKey(state.me.username,'report',job.id,day),{expected:report?.version||'new',reportId:report?.id||''});
 }
 el.querySelector('#reportDay')?.addEventListener('change',async event=>{
   const next=event.target.value;if(!next)return;const form=el.querySelector('#reportForm'),ctx=form.recovery;
   if(ctx?.saving){event.target.value=day;return;}
   await ctx?.ready;await ctx?.persist();state.reportDay=next;renderWork();
 });
 bindOutcomeForm(job);bindRelationshipForm(job);el.querySelector('#jobPartnerCounts')?.addEventListener('click',()=>openPartnerCounts(job.partnerId).catch(e=>toast(e.message,true)));
 el.querySelector('#back').addEventListener('click',()=>navigate('jobs'));
 if(done){el.querySelectorAll('#reportForm input,#reportForm textarea').forEach(x=>x.disabled=true);}el.querySelector('#reportForm').addEventListener('submit',event=>saveReport(event).catch(()=>{}));
 el.querySelector('#finish').addEventListener('click',async()=>{try{await saveReport(null,true);const pendingDays=await pendingReportDays(state.me.username,job.id).catch(()=>[]);if(pendingDays.length){toast('Guarda o descarta los borradores de otras jornadas antes de firmar: '+pendingDays.join(', '),true);return;}if(job.partnerInstallation){const result=await api('/jobs/'+job.id+'/outcomes','POST',{operationId:state.outcomeOperationId,expected:outcomeVersion(job),code:'completed',reason:el.querySelector('#notes').value||'Instalación terminada según parte del instalador.',technicianMode:isAdminUser()&&!isDirectionMode()});toast(result.notice||'Instalación enviada a Samuel.');await navigate('jobs');return;}state.otData=await api(`/jobs/${job.id}/ot-details`);state.page='sign';render();}catch(e){/* El guardado muestra el error. */}});
 if(admin)el.querySelector('#otDetailsBtn').addEventListener('click',async()=>{try{state.otData=await api(`/jobs/${job.id}/ot-details`);state.page='otDetails';render();}catch(e){toast(e.message,true);}});
 if(admin&&state.me.canManageRecords)el.querySelector('#directionEditBtn').addEventListener('click',async()=>{try{state.directionEdit=await api('/jobs/'+job.id+'/direction-edit');state.editOperationId=crypto.randomUUID();state.page='directionEdit';render();}catch(e){toast(e.message,true);}});
 if(admin&&OPEN_STATUSES.includes(job.status)&&!signed)el.querySelector('#saveAssign').addEventListener('click',async e=>{const users=[...el.querySelectorAll('.assign:checked')].map(x=>x.value);busy(e.target,true);try{if(!confirm('¿Guardar la fecha prevista y la asignación de este trabajo? No se enviarán avisos al equipo.'))return;const result=await api(`/jobs/${job.id}/schedule`,'PATCH',{users,date:el.querySelector('#scheduleDate').value,start:el.querySelector('#scheduleStart').value,end:el.querySelector('#scheduleEnd').value,expected:{date:job.date,assigned:job.assigned,start:job.start||'',end:job.end||''}});toast(result.warnings?.join(' ')||'Planificación guardada.');await openJob(job.id);}catch(err){toast(err.message,true);}finally{busy(e.target,false);}});
}
async function saveReport(event,forClose=false){
 event?.preventDefault();const form=el.querySelector('#reportForm');
 const result=await submitRecoverable(form,'report',`/jobs/${state.job.id}/reports`);
 state.reports=(await api(`/jobs/${state.job.id}/reports`)).reports;
 if(!forClose)renderWork();return !!result;
}
async function compressImage(file){if(!file.type.startsWith('image/'))throw new Error('Selecciona solo imágenes.');const bmp=await createImageBitmap(file);let scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close();let quality=.82;let blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',quality));while(blob?.size>4*1024*1024&&quality>.38){quality-=.14;blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',quality));}if(!blob||blob.size>4.8*1024*1024)throw new Error('La foto es demasiado grande.');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});return {filename:(file.name.replace(/\.[^.]+$/,'').replace(/[^\w.-]/g,'_').slice(0,65)||'foto')+'.jpg',contentType:'image/jpeg',file:base64};}
function renderVisits(){const options=state.jobs.filter(operationalJob).filter(technicianJobVisible).filter(x=>['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status)).map(j=>({value:j.id,label:`${j.client||'Cliente'} — ${j.reference||j.address}`}));
 layout(`<div class="titleblock"><span class="eyebrow">Formulario ASSA</span><h1>Visita técnica</h1><p>Registra los datos principales, medidas y fotografías desde tu móvil.</p></div><div class="warning">Los campos de la visita se guardan en la tabla original «VISITAS TÉCNICAS ASSA».</div><form id="visitForm"><div class="draft-status" id="draftStatus" role="status">Preparando borrador…</div><section class="panel"><h2><span class="section-num">01</span>Visita rápida</h2>${select('job','Trabajo existente',options,'','Sin vincular · nueva visita')}${field('contact','Si no aparece: nombre y teléfono')}${field('title','¿Qué necesita el cliente?','','text','required')}${select('service','Servicio',['Fontanería','Electricidad','Gas','Calderas','Climatización','Fotovoltaica','Aerotermia','Tratamiento de agua','Otros'])}${field('address','Dirección · calle, piso y población','','text','required')}${area('measures','Medidas · indica unidades (m, cm, Ø…)','', 'Longitud, altura, diámetros, recorridos…')}${area('material','Materiales · cantidad y modelo','', 'Lista y cantidades estimadas')}${select('next','Siguiente paso',['Preparar presupuesto','Faltan datos','Requiere otra visita','Solo registrar visita'])}<div class="form-field"><label for="photos">Fotos de la visita</label><input type="file" id="photos" accept="image/*" multiple><small>Adjunta varias fotografías desde Android.</small></div></section><details class="panel work-optional"><summary>Información adicional de la visita (opcional)</summary>${area('access','Incidencias y acceso')}${field('workers','Operarios estimados','','number','min="0" max="30"')}${field('hours','Horas estimadas por operario','','number','min="0" step="0.25"')}${area('notes','Notas')}<div class="pale">La fecha y el técnico se registran automáticamente.</div></details><div class="actions"><button type="submit" class="button primary">Guardar visita y fotografías</button></div></form>`);
 const visitForm=el.querySelector('#visitForm');
 bindRecovery(visitForm,draftKey(state.me.username,'visit'));
 visitForm.querySelector('[name=job]').addEventListener('change',event=>{
   const job=state.jobs.find(j=>j.id===event.target.value);if(!job)return;
   // These are verified work fields, never the customer's generic address.
   for(const [name,value] of Object.entries({address:job.address,title:job.description,contact:job.phone?`${job.client} · ${job.phone}`:''})){
     const input=visitForm.querySelector(`[name=${name}]`);if(!input.value&&value)input.value=value;
   }
   visitForm.dispatchEvent(new Event('input',{bubbles:true}));
 });
 visitForm.addEventListener('submit',async event=>{event.preventDefault();try{await submitRecoverable(visitForm,'visit','/visits');renderVisits();}catch{/* Draft remains available for retry. */}});

}
function renderUsers(){if(state.me.role!=='administrador')return navigate('jobs');layout(`<div class="titleblock"><span class="eyebrow">Administración</span><h1>Equipo ASSA</h1><p>Gestiona los accesos de tus trabajadores. No necesitan ChatGPT.</p></div><section class="panel"><h2>Crear acceso de instalador</h2><form id="userForm"><div class="grid2">${field('name','Nombre del empleado','','text','required')}${field('username','Usuario de acceso','','text','required pattern="[a-z][a-z0-9_-]{2,29}"')}</div>${field('password','Contraseña inicial (12 caracteres mínimo)','','password','required minlength="12" autocomplete="new-password"')}<div class="actions"><button class="button primary" type="submit">Crear usuario</button></div></form></section><section class="panel"><h2>Empleados registrados</h2>${state.employees.length?state.employees.map(u=>`<div class="job-card" style="align-items:center;margin:10px 0"><div><strong>${h(u.name||u.username)}</strong><div class="smalltext">@${h(u.username)} · ${h(u.role)}</div></div><button class="button small ${u.active?'danger':'primary'}" data-toggle="${u.id}" data-active="${u.active}">${u.active?'Desactivar':'Activar'}</button></div>`).join(''):'<p class="muted">Todavía no hay empleados creados.</p>'}</section>`);
 el.querySelector('#userForm').addEventListener('submit',async ev=>{ev.preventDefault();const btn=ev.target.querySelector('button');busy(btn,true);try{await api('/employees','POST',formData(ev.target));toast('Empleado creado. Ya puedes facilitarle su usuario y contraseña.');await navigate('users');}catch(e){toast(e.message,true);}finally{busy(btn,false);}});
 el.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/employees/${b.dataset.toggle}/active`,'PATCH',{active:b.dataset.active!=='true'});await navigate('users');toast('Acceso actualizado.');}catch(e){toast(e.message,true);}}));
}
function renderOutcomeForm(job,admin,signed){
 const canDecide=admin&&state.me.canManageRecords;
 if(admin&&!canDecide)return '<section class="panel"><h2>Resultado de la intervención</h2><p>'+h(job.outcome||'Pendiente de registrar por dirección')+'</p></section>';
 return `<section class="panel"><h2>Resultado de la visita o trabajo</h2>${job.outcome?'<div class="notice">Resultado registrado: '+h(job.outcome)+'</div>':''}<p>Una visita puede terminar sin ejecutar el trabajo. El resultado y el cobro se registran por separado.</p><form id="outcomeForm">${select('outcomeCode','¿Qué ha ocurrido?',OUTCOMES.map(o=>({value:o.code,label:o.label})))}${area('outcomeReason','Motivo y siguiente paso','','Explica el impedimento, qué necesita el cliente o por qué desiste.')}<p class="smalltext">${canDecide?'Confirmarás el resultado desde dirección. No se marcará cobrado ni se cambiarán facturas o importes.':(job.partnerInstallation?'Samuel revisará el parte de la instalación. No se necesitan datos ni firma del cliente final para este encargo del colaborador.':'Samuel revisará tu resultado antes de cambiar el estado del caso. Para un trabajo terminado se conserva el circuito de firma.')}</p><button class="button primary" type="submit">${canDecide?'Guardar resultado / cerrar caso':'Comunicar resultado a Samuel'}</button></form>${signed?'<p class="smalltext">El parte firmado original se conserva. Si necesitas cambiar lo que acredita, usa una rectificación de dirección.</p>':''}</section>`;
}
function bindOutcomeForm(job){
 el.querySelector('#outcomeForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const b=formData(e.target),option=outcomeOption(b.outcomeCode);if(!option)return toast('Selecciona el resultado de la visita.',true);
  if((b.outcomeReason||'').trim().length<5)return toast('Explica el motivo y el siguiente paso.',true);
  if(option.signature&&!(isDirectionMode()&&state.me.canManageRecords)&&!job.partnerInstallation){el.querySelector('#finish')?.click();return;}
  if(!confirm(option.closed?'¿Confirmar «'+option.label+'»? El cierre operativo no modifica el cobro.':'¿Guardar «'+option.label+'»? El caso continuará pendiente de la siguiente acción.'))return;
  const button=e.target.querySelector('button');busy(button,true);try{if(!(isDirectionMode()&&state.me.canManageRecords)){const reportForm=el.querySelector('#reportForm'),values=formData(reportForm);if(values.hours!==''||values.material?.trim()||values.notes?.trim()||reportForm.querySelector('#photos').files.length)await saveReport(null,true);}const result=await api('/jobs/'+job.id+'/outcomes','POST',{operationId:state.outcomeOperationId,expected:outcomeVersion(job),code:option.code,reason:b.outcomeReason,technicianMode:isAdminUser()&&!isDirectionMode()});toast(result.notice||'Resultado comunicado.');if(result.pending){await navigate('jobs');}else await openJob(job.id);}catch(err){toast(err.message,true);}finally{busy(button,false);}
 });
}
function outcomeReviewPanel(){
 if(!state.outcomeRequests.length)return '';
 return '<section class="panel"><h2>Resultados de visitas por revisar · '+state.outcomeRequests.length+'</h2>'+state.outcomeRequests.map(r=>`<article class="report"><h3>${h(r.job.client||r.job.reference)}</h3><p><strong>${h(r.label)}</strong> · ${h(r.by)} · ${h(r.at)}</p><p>${h(r.reason)}</p><div class="actions"><button class="button small light" data-outcome-open="${h(r.job.id)}">Revisar trabajo y partes</button>${state.canDecideOutcomes?`<button class="button small primary" data-outcome-decision="approve" data-request="${h(r.id)}" data-job="${h(r.job.id)}">Confirmar resultado</button><button class="button small ghost" data-outcome-decision="reject" data-request="${h(r.id)}" data-job="${h(r.job.id)}">Descartar solicitud</button>`:''}</div></article>`).join('')+'</section>';
}
function bindOutcomeReview(){
 el.querySelectorAll('[data-outcome-open]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.outcomeOpen)));
 el.querySelectorAll('[data-outcome-decision]').forEach(b=>b.addEventListener('click',async()=>{
  const decision=b.dataset.outcomeDecision;let reason='';if(decision==='reject'){reason=prompt('Motivo para descartar este resultado (el trabajo conservará su estado):')||'';if(reason.trim().length<5)return;}else if(!confirm('¿Confirmar el resultado de la visita? No se modifican cobros ni facturas.'))return;
  busy(b,true);try{const result=await api('/jobs/'+b.dataset.job+'/outcomes/'+b.dataset.request+'/decision','POST',{decision,reason});await loadDashboard();renderDashboard();toast(result.notice||'Resultado revisado.');}catch(err){toast(err.message,true);busy(b,false);}
 }));
}
function relationshipSummary(job){
 const invoice=isDirectionMode()?(state.clients.find(c=>c.id===job.invoiceTo)?.name||'Pendiente de confirmar'):'';
 if(!job.partnerName&&!job.occupant&&!job.accessPhone&&!job.invoiceTo)return '';
 return `<div class="pale relationship-summary"><p><strong>Origen del encargo:</strong> ${h(job.partnerName||'Cliente directo / sin colaborador')}${job.partnerRole?' · '+h(job.partnerRole):''}</p>${job.occupant?'<p><strong>Beneficiario / ocupante:</strong> '+h(job.occupant)+(job.occupantRole?' · '+h(job.occupantRole):'')+'</p>':''}${job.accessPhone?'<p><strong>Contacto de acceso:</strong> '+h(job.accessPhone)+'</p>':''}${isDirectionMode()?'<p><strong>Facturar a, previsto:</strong> '+h(invoice)+'</p>':''}</div>`;
}
function relationshipControls(prefix,job={}){
 return `<fieldset class="relationship-fields"><legend>Quién deriva, quién recibe y a quién facturar</legend>${select(prefix+'Partner','Colaborador que aporta el trabajo',[{value:'other',label:'Otro colaborador / por confirmar'},...state.partners.map(p=>({value:p.id,label:p.name}))],job.partnerId||'','Cliente directo / sin colaborador')}
 <div ${job.partnerId==='other'?'':'hidden'} id="${prefix}OtherFields">${field(prefix+'PartnerOther','Nombre o referencia · opcional',job.partnerOther||'','text','maxlength="180"')}<p class="smalltext">Puedes dejarlo pendiente y resolverlo después. No identifica un pagador ni crea una ficha.</p></div>${select(prefix+'PartnerRole','Papel en este encargo',PARTNER_ROLES,job.partnerRole||'','Sin colaborador')}<p class="smalltext" id="${prefix}PartnerNote">El papel habitual es una sugerencia; no determina quién paga.</p>
 <div class="grid2">${field(prefix+'Occupant','Beneficiario / ocupante del inmueble',job.occupant||'','text','maxlength="250"')}${select(prefix+'OccupantRole','Relación con el inmueble',OCCUPANT_ROLES,job.occupantRole||'','Sin confirmar')}</div>
 ${field(prefix+'AccessPhone','Teléfono para acceso / inquilino',job.accessPhone||'','tel','maxlength="50"')}
 ${select(prefix+'InvoiceTo','Facturar a · destinatario previsto',state.clients.map(c=>({value:c.id,label:c.name+' · '+(c.phone||c.address||'Ficha de cliente')})),job.invoiceTo||'','Pendiente de confirmar')}
 <p class="smalltext">La previsión no cambia el cliente del expediente, las facturas existentes ni los cobros. No se deduce el pagador del colaborador o del inquilino.</p></fieldset>`;
}
function bindRelationshipControls(prefix){
 const showNote=()=>{el.querySelector('#'+prefix+'OtherFields').hidden=el.querySelector('#'+prefix+'Partner').value!=='other';const partner=state.partners.find(p=>p.id===el.querySelector('#'+prefix+'Partner').value);el.querySelector('#'+prefix+'PartnerNote').textContent=partner?.notes||'El papel habitual es una sugerencia; no determina quién paga.';};
 el.querySelector('#'+prefix+'Partner')?.addEventListener('change',e=>{const partner=state.partners.find(p=>p.id===e.target.value);el.querySelector('#'+prefix+'PartnerRole').value=partner?.role||'';showNote();});
 if(el.querySelector('#'+prefix+'Partner'))showNote();
}
function relationshipData(prefix){return {partnerOther:el.querySelector('#'+prefix+'PartnerOther').value,partnerId:el.querySelector('#'+prefix+'Partner').value,partnerRole:el.querySelector('#'+prefix+'PartnerRole').value,occupant:el.querySelector('#'+prefix+'Occupant').value,occupantRole:el.querySelector('#'+prefix+'OccupantRole').value,accessPhone:el.querySelector('#'+prefix+'AccessPhone').value,invoiceTo:el.querySelector('#'+prefix+'InvoiceTo').value};}
function renderRelationshipForm(job){return `<section class="panel"><h2>Relaciones de este trabajo</h2><form id="relationshipForm">${relationshipControls('relationship',job)}${area('relationshipReason','Motivo / origen de la información','','Ej.: encargo derivado por Frankma; acceso con el inquilino')}<button class="button primary" type="submit">Guardar relaciones del encargo</button></form></section>`;}
function bindRelationshipForm(job){
 const form=el.querySelector('#relationshipForm');if(!form)return;bindRelationshipControls('relationship');
 form.addEventListener('submit',async e=>{e.preventDefault();const reason=el.querySelector('#relationshipReason').value;if(reason.trim().length<5)return toast('Indica el origen de la información.',true);if(!confirm('¿Guardar las relaciones de este encargo? No se modificarán facturas, cobros ni fichas históricas.'))return;const btn=form.querySelector('button');busy(btn,true);try{const result=await api('/jobs/'+job.id+'/relationships','PATCH',{operationId:state.relationshipOperationId,expected:relationshipVersion(job),reason,relationships:relationshipData('relationship')});await openJob(job.id);toast(result.notice||'Relaciones guardadas.');}catch(err){toast(err.message,true);}finally{busy(btn,false);}});
}
async function loadPartnerCounts(){const query=new URLSearchParams({...state.summaryRange,partnerId:state.summaryPartner});state.partnerCounts=await api('/admin/partner-installations?'+query);}
async function openPartnerCounts(partnerId){if(partnerId!==undefined)state.summaryPartner=partnerId||'';if(!state.partners.length)state.partners=(await api('/collaborators')).collaborators;await loadPartnerCounts();state.page='partnerCounts';render();}
function renderPartnerCounts(){
 const data=state.partnerCounts;if(!data)return;const c=data.counts;
 layout(`<button class="button ghost small" id="countsBack">← Volver a dirección</button><div class="titleblock"><span class="eyebrow">Control de instalaciones</span><h1>Recuento por colaborador</h1><p>Prepara el listado de cada 15 días sin dar de alta a sus clientes finales.</p></div><section class="panel"><form id="countsFilter">${select('countsPartner','Colaborador',[{value:'other',label:'Otro colaborador / por confirmar'},...state.partners.map(p=>({value:p.id,label:p.name}))],state.summaryPartner,'Todos los colaboradores')}<div class="grid2">${field('countsFrom','Desde',state.summaryRange.from,'date','required')}${field('countsTo','Hasta',state.summaryRange.to,'date','required')}</div><div class="actions"><button class="button primary" type="submit">Consultar periodo</button><button class="button light" type="button" id="countsPrevious">← 15 días</button><button class="button light" type="button" id="countsLatest">Últimos 15 días</button></div></form></section>
 <section class="dash-kpis"><div class="dash-kpi"><span>Instalaciones realizadas y revisadas</span><strong>${c.completedUnits}</strong></div><div class="dash-kpi"><span>Sin referencia de factura · preparar listado</span><strong>${c.toPrepareUnits}</strong></div><div class="dash-kpi"><span>Con referencia de factura</span><strong>${c.withInvoiceUnits}</strong></div><div class="dash-kpi"><span>Citas programadas</span><strong>${c.plannedJobs}</strong></div><div class="dash-kpi"><span>Pendientes de revisión</span><strong>${c.reviewJobs}</strong></div><div class="dash-kpi"><span>No realizadas / desistidas</span><strong>${c.notDoneJobs}</strong></div></section>
 <p class="notice">Las realizadas se cuentan por fecha real de ejecución, no por la fecha de la cita. Este listado no emite facturas ni confirma cobros. Una referencia anotada no demuestra por sí sola el envío o pago.</p>
 <section class="panel"><h2>Direcciones e instalaciones del periodo</h2>${data.rows.length?data.rows.map(r=>`<article class="report"><h3>${h(r.partner)}</h3><p>📍 ${h(r.address)}</p><p>${h(r.label)} · ${r.units??'Unidades pendientes'} instalación(es)</p><p>Prevista: ${h(r.plannedOn||'Sin fecha')} · Realizada: ${h(r.executedOn||'Pendiente')}</p>${r.invoiceRef?'<p>Referencia de factura: '+h(r.invoiceRef)+'</p>':''}<button class="button small light" data-count-job="${h(r.id)}">Ver trabajo</button></article>`).join(''):'<p>No hay instalaciones registradas en este periodo y colaborador.</p>'}</section>
 ${data.undated.length?`<section class="panel"><h2>Fuera del recuento: fecha de ejecución por confirmar · ${data.undated.length}</h2><p>No se incluyen en ningún total del periodo hasta completar la fecha real.</p>${data.undated.map(r=>`<p>${h(r.partner)} · ${h(r.address)} <button class="button small ghost" data-count-job="${h(r.id)}">Revisar fecha</button></p>`).join('')}</section>`:''}`);
 el.querySelector('#countsBack').addEventListener('click',()=>navigate('dashboard').catch(e=>toast(e.message,true)));
 el.querySelector('#countsFilter').addEventListener('submit',async e=>{e.preventDefault();const b=formData(e.target);state.summaryRange={from:b.countsFrom,to:b.countsTo};state.summaryPartner=b.countsPartner;try{await loadPartnerCounts();renderPartnerCounts();}catch(err){toast(err.message,true);}});
 el.querySelector('#countsPrevious').addEventListener('click',async()=>{for(const key of ['from','to']){const d=new Date(state.summaryRange[key]+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-15);state.summaryRange[key]=d.toISOString().slice(0,10);}try{await loadPartnerCounts();renderPartnerCounts();}catch(err){toast(err.message,true);}});
 el.querySelector('#countsLatest').addEventListener('click',async()=>{state.summaryRange=fifteenDayRange(madridToday());try{await loadPartnerCounts();renderPartnerCounts();}catch(err){toast(err.message,true);}});
 el.querySelectorAll('[data-count-job]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.countJob)));
}
function renderWorkSigned(part){
 if(!part)return '';
 return `<section class="panel"><h2><span class="section-num">✍️</span>Parte firmado por el cliente</h2><div class="notice">✓ Documento firmado y archivado en Airtable · ${h(part.number)}</div>${part.file?.url?`<a class="button primary" target="_blank" rel="noopener noreferrer" href="${h(part.file.url)}">📄 Ver PDF firmado</a>`:'<p class="muted">El PDF está archivado en Airtable.</p>'}</section>`;
}
function renderSign(){
 const job=state.job;
 if(!job)return navigate('jobs');
 const report=state.otData?.summary||state.reports.find(r=>r.user===state.me.username)||state.reports[0];
 if(!report){state.page='work';render();return toast('Guarda el parte antes de firmarlo.',true);}
 layout(`<button class="button ghost small" id="backSign">← Volver al trabajo</button>
 <div class="titleblock"><span class="eyebrow">Parte de trabajo ASSA</span><h1>Firma del cliente</h1><p>Muestra al cliente el trabajo realizado y pídele que firme en la pantalla.</p></div>
 <div class="actions"><a class="button ghost" target="_blank" rel="noopener noreferrer" href="/api/jobs/${job.id}/ot?v=assa-ot-v5-20261104">📄 Ver OT ASSA (nuevo PDF) antes de firmar</a></div>
 <section class="panel"><h2>Resumen de la intervención</h2>
 <p><strong>Cliente:</strong> ${h(job.client||'Cliente')}<br><strong>Trabajo:</strong> ${h(job.reference||'Trabajo ASSA')}<br><strong>Dirección:</strong> ${h(job.address||'A confirmar')}<br><strong>Horas:</strong> ${h(report.hours??'Sin indicar')}</p>
 <div class="pale"><strong>Trabajo solicitado</strong><p>${h(job.description||'Sin descripción')}</p></div>
 <h3>Trabajo realizado y observaciones del equipo</h3><p class="signature-summary">${h(report.notes||'Sin observaciones adicionales')}</p>
 <h3>Material empleado</h3><p class="signature-summary">${h(report.material||'Sin material detallado')}</p></section>
 <form id="signatureForm"><section class="panel"><h2><span class="section-num">✍️</span>Recepción y firma</h2>
 ${field('signer','Nombre y apellidos de quien firma','','text','required minlength="3" maxlength="120" autocomplete="name"')}
 <details class="work-optional"><summary>📍 Corregir dirección o añadir observaciones (opcional)</summary>${field('signAddress','Dirección del trabajo',state.otData?.info?.address||job.address||'','text','maxlength="220"')}
 ${area('customerNotes','Observaciones del cliente (si las hay)','','Incidencias pendientes, reservas o comentarios…')}</details>
 <p class="muted">Firmando confirmo que se me ha mostrado este parte y que reconozco la realización de la intervención descrita. La firma no sustituye una factura ni limita garantías o derechos.</p>
 <div class="form-field"><label>Firma en la pantalla</label><canvas id="signatureCanvas" class="signature-canvas" width="960" height="280" aria-label="Zona para firmar con el dedo"></canvas><small>Firma con el dedo. Puedes borrar y repetir.</small></div>
 <button type="button" class="button light small" id="clearSignature">Borrar firma</button>
 <label class="signature-check"><input type="checkbox" id="signatureConsent" required> He revisado el parte y confirmo su recepción.</label>
 <div class="warning">Al confirmar, se conservará el PDF firmado y el parte quedará bloqueado. Samuel revisará la ejecución antes de cerrar el trabajo.</div>
 <div class="actions"><button class="button primary" type="submit">✓ Guardar firma y enviar a Samuel</button></div></section></form>`);
 el.querySelector('#backSign').addEventListener('click',()=>{state.page='work';render();});
 const canvas=el.querySelector('#signatureCanvas'),ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#1d3046';ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';
 let active=false,hasSignature=false,last=null;
 const pos=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();active=true;last=pos(e);canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!active)return;e.preventDefault();const p=pos(e);if(Math.hypot(p.x-last.x,p.y-last.y)>2){ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();hasSignature=true;last=p;}});
 const end=()=>{active=false;last=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 el.querySelector('#clearSignature').addEventListener('click',()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);hasSignature=false;});
 el.querySelector('#signatureForm').addEventListener('submit',async ev=>{
   ev.preventDefault();
   if(!hasSignature)return toast('El cliente debe dibujar su firma.',true);
   const button=ev.target.querySelector('button[type=submit]');busy(button,true);
   try{
     const result=await api(`/jobs/${job.id}/sign`,'POST',{
       signer:el.querySelector('#signer').value,
       address:el.querySelector('#signAddress').value,
       customerNotes:el.querySelector('#customerNotes').value,
       accepted:el.querySelector('#signatureConsent').checked,
       signature:canvas.toDataURL('image/png')
     });
     state.signedResult=result.part;
     state.page='signedDone';state.job=null;
     await loadJobs();render();
   }catch(error){toast(error.message,true);}
   finally{busy(button,false);}
 });
}
function renderSignedDone(){
 const part=state.signedResult||{};
 layout(`<div class="titleblock"><span class="eyebrow">ASSA Instalaciones</span><h1>Parte enviado a revisión</h1></div>
 <section class="panel signed-success"><div class="signed-check">✓</div><h2>Parte firmado y archivado</h2>
 <p>El documento ${h(part.number||'')} está registrado en Airtable. La ejecución está bloqueada para conservar la firma. Samuel debe revisar y aprobar el cierre; el trabajo sigue visible mientras está pendiente.</p>
 ${part.file?.url?`<a class="button primary" href="${h(part.file.url)}" target="_blank" rel="noopener noreferrer">📄 Abrir PDF firmado</a>`:''}
 <button type="button" class="button ghost" id="returnJobs">Volver a mis trabajos</button></section>`);
 el.querySelector('#returnJobs').addEventListener('click',()=>navigate('jobs'));
}

function renderOTDetails(){
  const job=state.job,entry=state.otData;
  if(!job||!entry)return navigate('jobs');
  const v=entry.info||{},commercial=v.commercial||{};
  const fmtEuro=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('es-ES',{style:'currency',currency:'EUR'}):'No confirmado';
  const missing=entry.missing||[];
  layout(`<button type="button" class="button ghost small" id="backOT">← Volver al trabajo</button>
  <div class="titleblock"><span class="eyebrow">Administración ASSA</span><h1>Preparar orden de trabajo</h1><p>Datos obtenidos de Airtable para ${h(job.reference||'esta intervención')}.</p></div>
  <section class="panel"><h2>Estado de la OT</h2>
    <p><strong>Número:</strong> ${h(entry.number||'Sin número todavía')}</p>
    <p><strong>Concepto comercial:</strong> ${h(commercial.item||'Pendiente')}</p>
    <p><strong>Total del presupuesto:</strong> ${h(fmtEuro(commercial.priceVerified?commercial.total:null))}</p>
    ${missing.length?`<div class="warning"><strong>Información pendiente:</strong> ${h(missing.join(' · '))}</div>`:
      '<div class="notice">✓ Datos de la OT disponibles.</div>'}
    ${entry.signed?'<div class="notice">Este trabajo ya tiene un PDF firmado. Los datos y el documento firmado están protegidos.</div>':''}
    <p class="muted">El precio se toma del presupuesto confirmado en Airtable. No se edita aquí ni se utiliza el coste de material. Si falta un dato, la OT puede prepararse como borrador.</p>
  </section>
  <form id="otDataForm"><section class="panel"><h2>Datos del cliente</h2>
    ${field('otClient','Nombre / empresa',v.client||'','text','maxlength="200"')}
    ${field('otAddress','Dirección de la intervención',v.address||'','text','maxlength="220"')}
    <div class="grid2">${field('otPhone','Teléfono',v.phone||'','tel','maxlength="50"')}${field('otEmail','Correo electrónico',v.email||'','email','maxlength="200"')}</div>
    <div class="grid2">${field('otCity','Población',v.city||'','text','maxlength="100"')}${field('otPostal','Código postal',v.postal||'','text','maxlength="14"')}</div>
    ${field('otTaxId','NIF / DNI (si está disponible)',v.taxId||'','text','maxlength="32"')}
    <div class="grid2">${field('otBudgetDate','Fecha del presupuesto',v.budgetDate||'','date','')}${field('otTime','Hora de cita',v.time||'','text','maxlength="40"')}</div>
    <p class="muted">Cuando Samuel confirme los datos de facturación, se puede completar esta ficha. El PDF original firmado siempre se conserva.</p>
    <div class="actions"><button type="submit" class="button primary">Guardar datos en Airtable</button>
      <a class="button ghost" target="_blank" rel="noopener noreferrer" href="/api/jobs/${job.id}/ot?v=assa-ot-v5-datos-20261104">📄 Vista previa de OT</a></div>
  </section></form>`);
  el.querySelector('#backOT').addEventListener('click',()=>{state.page='work';render();});
  if(!entry.editable)el.querySelectorAll('#otDataForm input,#otDataForm button').forEach(x=>x.disabled=true);
  el.querySelector('#otDataForm').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const btn=ev.target.querySelector('[type=submit]');busy(btn,true);
    try{
      const payload={
        client:el.querySelector('#otClient').value,
        address:el.querySelector('#otAddress').value,
        phone:el.querySelector('#otPhone').value,
        email:el.querySelector('#otEmail').value,
        city:el.querySelector('#otCity').value,
        postal:el.querySelector('#otPostal').value,
        taxId:el.querySelector('#otTaxId').value,
        budgetDate:el.querySelector('#otBudgetDate').value,
        time:el.querySelector('#otTime').value
      };
      const result=await api(`/jobs/${job.id}/ot-details`,'PATCH',payload);
      toast(result.documentNotice||'Datos OT guardados.');
      state.otData=await api(`/jobs/${job.id}/ot-details`);
      state.job=(await api(`/jobs/${job.id}`)).job;
      render();
    }catch(e){toast(e.message,true);}
    finally{busy(btn,false);}
  });
}
function historyValue(key,value){if(key===REL_FIELDS.partnerId)return h((value||[]).map(id=>state.partners.find(p=>p.id===id)?.name||'Colaborador no disponible').join(', ')||'Vacío');if(key===REL_FIELDS.invoiceTo)return h((value||[]).map(id=>state.clients.find(c=>c.id===id)?.name||'Destinatario no disponible').join(', ')||'Vacío');return h(value??'Vacío');}
function renderDirectionEdit(){
 const entry=state.directionEdit;if(!entry||!state.me.canManageRecords)return navigate('jobs');
 const job=entry.job,team=state.employees.filter(e=>e.active&&e.role==='tecnico');
 const selected=entry.reports.find(r=>r.id===entry.selectedReport)||entry.reports[0];entry.selectedReport=selected?.id||'';
 layout(`<button class="button ghost small" id="backDirectionEdit">← Volver al trabajo</button><div class="titleblock"><span class="eyebrow">Solo dirección</span><h1>Editar trabajo y parte</h1><p>${h(job.client)} · Estado actual: ${h(job.status||'Sin clasificar')}</p></div>
 <div class="notice">Cambiar datos no cierra ni reabre el trabajo. Los importes, facturas y cobros se conservan. ${entry.signed?'El PDF firmado original se conserva; las correcciones del parte se añaden como rectificación.':''}</div>
 <form id="directionEditForm"><section class="panel"><h2>Ficha del trabajo</h2><div class="grid2">${field('editClient','Nombre del cliente',job.client,'text','required maxlength="200"')}${field('editPhone','Teléfono',job.phone,'tel','maxlength="50"')}</div>${field('editAddress','Dirección de la intervención',job.address,'text','maxlength="220"')}${field('editEmail','Correo electrónico',job.email,'email','maxlength="200"')}${area('editDescription','Descripción del trabajo',job.description)}${job.partnerInstallation?`<div class="grid2">${field('editInstallationUnits','Número de instalaciones',job.installationUnits??1,'number','min="1" max="100" step="1"')}${field('editExecutedOn','Fecha real de ejecución',job.executedOn||'','date')}</div>`:''}
 <div class="grid2">${field('editPlannedDate','Fecha prevista',job.date,'date')}<div class="grid2">${field('editStart','Inicio previsto',job.start,'time')}${field('editEnd','Fin previsto',job.end,'time')}</div></div><p><strong>Técnicos asignados</strong></p><div class="switches">${team.map(u=>`<label class="check-pill"><input class="edit-tech" type="checkbox" value="${h(u.username)}" ${assignedUsers(job.assigned).includes(u.username)?'checked':''}>${h(u.name||u.username)}</label>`).join('')}</div></section>
 ${selected?`<section class="panel"><h2>Parte del técnico</h2>${select('editReport','Parte a revisar',entry.reports.map(r=>({value:r.id,label:r.user+' · '+(r.date||'Sin fecha')+' · '+(r.done?'Finalizado':'En curso')})),selected.id)}<label class="check-pill"><input id="correctReport" type="checkbox"> Corregir también este parte</label><p class="muted">${entry.signed||selected.done?'Se guardará una rectificación en el historial, conservando el parte cerrado y la firma originales.':'Se corregirá este registro del técnico, conservando sus datos anteriores en el historial.'}</p><div class="grid2">${field('editReportHours','Horas reales',selected.hours,'number','min="0" max="24" step="0.25"')}${field('editReportDate','Fecha del parte',selected.date,'date')}</div>${area('editReportMaterial','Material utilizado',selected.material)}${area('editReportNotes','Observaciones del técnico',selected.notes)}<p class="smalltext">Las fotografías originales y el usuario del técnico se conservan.</p></section>`:''}
 <section class="panel"><h2>Motivo e historial</h2><p class="smalltext">Si quieres indicar que no se hizo el trabajo o que el cliente desistió, utiliza el resultado de la visita.</p><button type="button" class="button light small" id="editOutcomeShortcut">Registrar resultado / cerrar caso</button>${area('editReason','Motivo de la corrección','','Ej.: corregir una fecha o completar información del diagnóstico')}<p class="smalltext">Se conservarán los datos anteriores, los nuevos, tu usuario y la fecha.</p><button class="button primary" type="submit">Guardar corrección de dirección</button></section></form>
 <section class="panel"><h2>Historial de correcciones</h2>${entry.history.length?entry.history.slice().reverse().map(e=>`<article class="report"><strong>${h(e.reason)}</strong><p>${h(e.by)} · ${h(e.at)} · ${({applied:'Corrección guardada',approved:'Resultado confirmado',rejected:'Solicitud descartada',requested:'Pendiente de Samuel',applying:'Pendiente de completar'})[e.state]||'Revisar'}</p>${Object.keys(e.after||{}).map(k=>`<p class="smalltext">${h(k)}: ${historyValue(k,e.before?.[k])} → ${historyValue(k,e.after[k])}</p>`).join('')}${Object.keys(e.reportAfter||{}).length?`<p>${e.reportMode==='annotation'?'Rectificación de parte cerrado (original conservado)':'Corrección del registro del técnico'} · ${h(e.reportId)}</p>${Object.keys(e.reportAfter).map(k=>`<p class="smalltext">${h(k)}: ${h(e.reportBefore?.[k]??'Vacío')} → ${h(e.reportAfter[k]??'Vacío')}</p>`).join('')}`:''}</article>`).join(''):'<p>No hay correcciones registradas.</p>'}</section>`);
 el.querySelector('#editDescription').maxLength=10000;
 el.querySelector('#editOutcomeShortcut').addEventListener('click',async()=>{const reason=el.querySelector('#editReason').value;await openJob(job.id);const field=el.querySelector('#outcomeReason');if(field)field.value=reason;el.querySelector('#outcomeForm')?.scrollIntoView({behavior:'smooth',block:'start'});});
 el.querySelector('#backDirectionEdit').addEventListener('click',()=>openJob(job.id));
 el.querySelector('#editReport')?.addEventListener('change',e=>{const r=entry.reports.find(r=>r.id===e.target.value);if(!r)return;entry.selectedReport=r.id;el.querySelector('#editReportHours').value=r.hours;el.querySelector('#editReportDate').value=r.date;el.querySelector('#editReportMaterial').value=r.material;el.querySelector('#editReportNotes').value=r.notes;el.querySelector('#correctReport').checked=false;});
 el.querySelector('#directionEditForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=formData(e.target),reason=f.editReason.trim();if(reason.length<5)return toast('Indica el motivo de la corrección.',true);
  const assignments=[...el.querySelectorAll('.edit-tech:checked')].map(x=>x.value);
  const originalUsers=assignedUsers(job.assigned);for(const u of originalUsers)if(!team.some(t=>t.username===u))assignments.push(u);
  const changes={...(job.partnerInstallation?{installationUnits:f.editInstallationUnits,executedOn:f.editExecutedOn}:{}),client:f.editClient,address:f.editAddress,phone:f.editPhone,email:f.editEmail,description:f.editDescription,date:f.editPlannedDate,start:f.editStart,end:f.editEnd,assigned:[...new Set(assignments)].join(', ')};
  const correct=el.querySelector('#correctReport')?.checked;
  const payload={operationId:state.editOperationId,expected:entry.version,reason,changes:changedJobFields(job,changes),...(correct?{reportId:el.querySelector('#editReport').value,reportChanges:{hours:f.editReportHours,date:f.editReportDate,material:f.editReportMaterial,notes:f.editReportNotes}}:{})};
  if(!confirm('¿Guardar esta corrección de dirección y su motivo? El estado del trabajo y los datos de facturación/cobro no cambiarán.'))return;
  const btn=e.target.querySelector('[type=submit]');busy(btn,true);try{const result=await api('/jobs/'+job.id+'/direction-edit','PATCH',payload);state.directionEdit=await api('/jobs/'+job.id+'/direction-edit');state.editOperationId=crypto.randomUUID();renderDirectionEdit();toast(result.notice);}catch(err){toast(err.message,true);}finally{busy(btn,false);}
 });
}

function simplifyWorkPanels(){
 for(const panel of el.querySelectorAll('section.panel')){
   const title=panel.querySelector('h2');
   if(!title||!/(Relaciones de este trabajo|Control de dirección|Preparación de OT|Fecha prevista y técnicos|Jornadas registradas|Costes del trabajo)/.test(title.textContent))continue;
   const details=document.createElement('details'),summary=document.createElement('summary');
   details.className='work-section';summary.textContent=title.textContent;title.remove();
   details.append(summary,...Array.from(panel.childNodes));panel.append(details);
 }
}
function renderToday(){
 const today=madridToday(),active=state.jobs.filter(operationalJob).filter(technicianJobVisible).filter(j=>OPEN_STATUSES.includes(j.status));
 const daily=active.filter(j=>j.date===today).sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
 const pending=active.filter(j=>!j.date||j.date<today),next=active.filter(j=>j.date>today).sort((a,b)=>(a.date+(a.start||'99:99')).localeCompare(b.date+(b.start||'99:99'))).slice(0,3);
 const card=j=>`<article class="job-card"><div><h3>${h(j.client||j.reference)}</h3><p>${h(j.date||'Sin fecha')} · ${h(j.start||'Sin hora')} · ${h(j.status)}</p><p>${h(j.description||'Trabajo por concretar')}</p><p>📍 ${h(j.address||'Dirección pendiente')} · 👷 ${h(j.assigned||'Sin técnico asignado')}</p>${jobContactActions(j,true)}</div><button class="button primary small" data-open="${h(j.id)}">Abrir trabajo</button></article>`;
 layout(`<div class="topbar"><div class="titleblock"><span class="eyebrow">${h(state.me.name||'Equipo ASSA')}</span><h1>Hoy en ASSA</h1><p>${h(today)} · Tu jornada, sin buscar entre pantallas.</p></div><button class="button light" id="todayRefresh">Actualizar</button></div>${isAdminUser()&&!isDirectionMode()?`<div class="actions"><button class="button light small" id="toggleTechnicianJobs">${state.showAllTechnicianJobs?'Ver solo mis trabajos':'Ver otros trabajos abiertos'}</button></div>`:''}<section class="panel"><h2>Trabajos de hoy · ${daily.length}</h2>${daily.map(card).join('')||'<p>No hay trabajos programados para hoy.</p>'}</section><section class="panel"><h2>Próximos trabajos</h2>${next.map(card).join('')||'<p>No hay próximos trabajos con fecha.</p>'}</section><details class="panel"><summary>Revisar fecha o planificación · ${pending.length}</summary>${pending.map(card).join('')||'<p>Sin pendientes de fecha.</p>'}</details>`);
 el.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.open)));
 el.querySelector('#toggleTechnicianJobs')?.addEventListener('click',()=>{state.showAllTechnicianJobs=!state.showAllTechnicianJobs;renderToday();});
 el.querySelector('#todayRefresh').addEventListener('click',()=>navigate('today').catch(e=>toast(e.message,true)));
}
function bindRecovery(form,key,initial={}){
 const status=form.querySelector('#draftStatus');
 if(status&&typeof document.createElement==='function'){
   const discard=document.createElement('button');discard.type='button';discard.className='button ghost small';discard.textContent='Descartar borrador local';
   discard.addEventListener('click',async()=>{const current=form.recovery;if(current?.saving)return;if(!confirm('¿Descartar el borrador y las fotos pendientes de este dispositivo? Lo guardado en Airtable se conserva.'))return;await current?.ready;await current?.photoTask;await current?.queue;await clearDraft(key).catch(()=>{});if(state.page==='work'){await openJob(state.job.id);}else renderVisits();});status.after(discard);
 }
 const ctx={fields:formData(form),uploads:[],remoteId:'',operationId:crypto.randomUUID(),...initial};
 form.recovery=ctx;draftSessions.add(ctx);ctx.key=key;ctx.saving=false;ctx.queue=Promise.resolve();
 const message=text=>{if(status)status.textContent=text;};ctx.message=message;
 ctx.persist=()=>{if(ctx.cancelled)return Promise.resolve(false);const value={fields:{...ctx.fields},uploads:ctx.uploads.map(p=>({...p})),remoteId:ctx.remoteId,operationId:ctx.operationId,expected:ctx.expected||'',reportId:ctx.reportId||'',submittedFields:ctx.submittedFields||null};ctx.queue=ctx.queue.catch(()=>{}).then(()=>saveDraft(key,value)).then(()=>true).catch(()=>{ctx.storageError=true;return false;});return ctx.queue;};
 form.inert=true;
 ctx.ready=(async()=>{
   try{const saved=await loadDraft(key);if(saved){Object.assign(ctx,saved);for(const [name,value] of Object.entries(ctx.fields||{})){const input=form.elements.namedItem(name);if(input&&input.type!=='file')input.value=value;}message(ctx.remoteId?'Datos guardados · quedan fotos pendientes. Pulsa Guardar para reintentar.':'Borrador recuperado de este dispositivo · pendiente de guardar en Airtable.');}else message('Borrador local automático · caduca en 24 h. Se elimina al salir de la sesión.');}
   catch(error){message(error.message);ctx.storageError=true;}
   finally{form.inert=false;if(ctx.submittedFields||ctx.remoteId)freezeForm(form,true);}
 })();
 form.addEventListener('input',()=>{if(ctx.saving||ctx.submittedFields)return;ctx.fields=formData(form);ctx.persist().then(ok=>message(ok?'Borrador guardado en este dispositivo · pendiente de Airtable.':'No se pudo conservar el borrador local. Mantén esta pantalla abierta hasta guardar.')).catch(()=>message('No se pudo conservar el borrador local. Mantén esta pantalla abierta hasta guardar.'));});
 const photos=form.querySelector('#photos');
 photos?.addEventListener('change',()=>{ctx.photoError=null;const files=Array.from(photos.files);ctx.photoTask=(ctx.photoTask||ctx.ready).then(async()=>{message('Preparando fotografías…');for(const file of files)ctx.uploads.push(await compressImage(file));await ctx.persist();photos.value='';message(`${ctx.uploads.length} fotos conservadas para subir · borrador local guardado.`);}).catch(error=>{ctx.photoError=error;message(error.message);});});
 return ctx;
}
function freezeForm(form,frozen){for(const input of form.querySelectorAll('input,textarea,select'))input.disabled=frozen;}
async function submitRecoverable(form,kind,path){
 const ctx=form.recovery;if(!ctx)throw new Error('Espera a que se prepare el formulario.');await ctx.ready;await ctx.photoTask;
 if(ctx.photoError){toast('Una foto no pudo prepararse. Vuelve a seleccionarla antes de guardar.',true);throw ctx.photoError;}
 if(ctx.saving)throw new Error('El formulario ya se está guardando.');
 ctx.fields=ctx.submittedFields||(ctx.remoteId?ctx.fields:formData(form));ctx.saving=true;ctx.message('Guardando datos y fotografías…');
 const btn=form.querySelector('[type=submit]');busy(btn,true);freezeForm(form,true);
 try{
   if(kind==='visit'&&!ctx.submittedFields)ctx.submittedFields={...ctx.fields};
   // Persist before the first network write, including the stable operation ID.
   await ctx.persist();
   if(!ctx.remoteId){const data=kind==='visit'?{...ctx.fields,operationId:ctx.operationId}:{...ctx.fields,expected:ctx.expected||undefined,reportId:ctx.reportId||undefined};
     const result=await api(path,'POST',data);ctx.remoteId=kind==='visit'?result.id:result.report.id;
     if(kind==='report'){ctx.reportId=result.report.id;ctx.expected=result.report.version;}
     await ctx.persist();
   }
   for(let i=0;ctx.uploads.length;i++){
     ctx.message(`Datos guardados · subiendo fotografía ${i+1}…`);
     await api(`/${kind==='visit'?'visits':'reports'}/${ctx.remoteId}/photo`,'POST',ctx.uploads[0]);
     ctx.uploads.shift();await ctx.persist();
   }
   await clearDraft(ctx.key).catch(()=>{});ctx.message('Guardado en Airtable · fotografías completas.');toast(kind==='visit'?'Visita y fotografías guardadas.':'Jornada y fotografías guardadas.');return ctx.remoteId;
 }catch(error){if(!ctx.remoteId&&[400,403].includes(error.status)){ctx.submittedFields=null;await ctx.persist();}ctx.message(ctx.storageError?'Guardado sin confirmar. Mantén esta pantalla abierta; no hay copia local disponible.':ctx.remoteId?'Datos guardados · hay fotos pendientes. Pulsa Guardar para reintentar sin duplicar.':'No se ha confirmado el guardado. Conservamos el borrador para reintentar.');toast(error.message,true);throw error;}
 finally{ctx.saving=false;busy(btn,false);if(!ctx.remoteId&&!ctx.submittedFields)freezeForm(form,false);}
}
function economicPanel(info){
 if(!info)return '';
 const value=n=>typeof n==='number'?h(n):'Sin datos';
 const money=n=>typeof n==='number'?h(n.toLocaleString('es-ES',{style:'currency',currency:'EUR'})):'Sin datos';
 return `<section class="panel"><h2>Costes del trabajo</h2><p><strong>${h(info.status)}</strong>${info.reviewPending?' · Revisión de costes pendiente':''}</p><p>Horas cerradas declaradas: ${value(info.declaredHours)} h · Horas verificadas: ${value(info.verifiedHours)} h</p><p>Mano de obra provisional de Airtable: ${money(info.provisionalLabour)}</p><p>Margen analítico tras mano de obra: ${info.status==='Completo documentado'?money(info.margin):'Pendiente de validar todos los datos'}</p><p class="smalltext">La estimación no es beneficio neto. No incluye una nueva imputación de nóminas ni modifica costes o facturas.</p>${info.evidence?`<p class="signature-summary">${h(info.evidence)}</p>`:''}</section>`;
}
init();

