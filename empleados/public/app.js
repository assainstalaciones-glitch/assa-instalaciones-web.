const el=document.querySelector('#app');
const state={me:null,jobs:[],employees:[],dashboard:null,dashboardFilter:'review',dashboardSearch:'',page:'jobs',job:null,reports:[],signedParts:[],signedResult:null,otData:null,search:'',status:'active',savedVisit:null};
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(path,method='GET',data)=>{const resp=await fetch(`/api${path}`,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:data===undefined?undefined:JSON.stringify(data)});const json=await resp.json().catch(()=>({}));if(!resp.ok)throw new Error(json.error||`Error ${resp.status}`);return json;};
let toastTimer;function toast(message,error=false){const box=document.querySelector('#toast');box.textContent=message;box.className=error?'visible error':'visible';clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='',4600);}
function busy(btn,on){if(btn){btn.disabled=on;btn.dataset.label||=btn.textContent;btn.innerHTML=on?'<span class="loader"></span> Guardando…':h(btn.dataset.label);}}
function field(name,label,value='',type='text',attrs=''){return `<div class="form-field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${h(value)}" ${attrs}></div>`;}
function area(name,label,value='',placeholder=''){return `<div class="form-field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" placeholder="${h(placeholder)}">${h(value)}</textarea></div>`;}
function select(name,label,choices,value='',empty='Seleccionar…'){return `<div class="form-field"><label for="${name}">${label}</label><select id="${name}" name="${name}"><option value="">${empty}</option>${choices.map(x=>{const v=typeof x==='string'?x:x.value;const label=typeof x==='string'?x:x.label;return `<option value="${h(v)}" ${v===value?'selected':''}>${h(label)}</option>`;}).join('')}</select></div>`;}
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function layout(content){const admin=state.me?.role==='administrador';const nav=[...(admin?[['dashboard','📊','Dirección']]:[]),['jobs','📋','Trabajos'],['visits','📍','Visitas'],...(admin?[['users','👷','Empleados']]:[])];const navButtons=nav.map(([page,ico,label])=>`<button class="navbtn ${state.page===page?'active':''}" data-nav="${page}"><span class="navicon">${ico}</span>${label}</button>`).join('');const bottom=nav.map(([page,ico,label])=>`<button class="${state.page===page?'active':''}" data-nav="${page}"><span>${ico}</span>${label}</button>`).join('');
 el.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-logo">A</span><span>ASSA <small style="display:block;font-size:10px;letter-spacing:1px;font-weight:600;color:#9cb9c8">INSTALACIONES</small></span></div>${navButtons}<div class="side-bottom"><strong>${h(state.me?.name||'')}</strong>${admin?'Administración':'Técnico instalador'}<button class="button small" id="logout">Cerrar sesión</button></div></aside><header class="header-mobile"><div class="brand"><span class="brand-logo">A</span> ASSA Instalaciones</div><button id="logoutMobile">Salir</button></header><main class="main">${content}</main><nav class="bottom-nav">${bottom}</nav></div>`;
 el.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.nav)));el.querySelectorAll('#logout,#logoutMobile').forEach(btn=>btn.addEventListener('click',logout));
}
async function init(){try{const result=await api('/me');state.me=result.user;if(state.me.role==='administrador'){state.page='dashboard';await loadDashboard();}else{state.page='jobs';await loadJobs();}render();}catch{showLogin();}}
function showLogin(){el.innerHTML=`<div class="login-scene"><div class="login-art"><div class="brand"><span class="brand-logo">A</span> ASSA Instalaciones</div><div><h1>Todo el trabajo.<br>En un solo lugar.</h1><p>Visitas, partes de trabajo y seguimiento del equipo, organizados y conectados con ASSA.</p></div><div class="art-foot">Portal privado de empleados · Cambrils</div></div><div class="login-panel"><div class="login-card"><span class="eyebrow">Acceso exclusivo</span><h2>Bienvenido al equipo</h2><p class="muted">Accede con las credenciales facilitadas por ASSA.</p><form id="loginForm">${field('username','Usuario','','text','autocomplete="username" required autofocus')}${field('password','Contraseña','','password','autocomplete="current-password" required')}<button class="button primary full" type="submit">Entrar al portal</button></form><div class="hint">¿No tienes acceso? Pide tu usuario a administración.</div></div></div></div>`;
 document.querySelector('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');busy(btn,true);try{const result=await api('/login','POST',formData(e.target));state.me=result.user;if(state.me.role==='administrador'){state.page='dashboard';await loadDashboard();}else{state.page='jobs';await loadJobs();}render();}catch(err){toast(err.message,true);}finally{busy(btn,false);}});
}
async function logout(){await api('/logout','POST').catch(()=>{});state.me=null;showLogin();}
async function loadDashboard(){state.dashboard=await api('/admin/dashboard');}
async function loadJobs(){state.jobs=(await api('/jobs')).jobs;}
async function navigate(page){state.page=page;state.job=null;state.savedVisit=null;if(page==='jobs')await loadJobs();if(page==='dashboard')await loadDashboard();if(page==='users'){try{state.employees=(await api('/employees')).employees;}catch(e){toast(e.message,true);}}render();}
function render(){if(state.page==='dashboard')renderDashboard();else if(state.page==='jobs')renderJobs();else if(state.page==='work')renderWork();else if(state.page==='visits')renderVisits();else if(state.page==='users')renderUsers();else if(state.page==='sign')renderSign();else if(state.page==='signedDone')renderSignedDone();else if(state.page==='otDetails')renderOTDetails();}

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
    {key:'closed',label:'Cerrados y cobrados'},
    {key:'all',label:'Todos'}
  ];
  const predicate={
    review:r=>r.needsReview,active:r=>r.active,unsigned:r=>r.needsSignature,
    noInvoice:r=>r.noInvoiceEvidence,incomplete:r=>r.dataIncomplete,invoice:r=>r.needsInvoice,
    payment:r=>r.needsPayment,closed:r=>r.closed,all:r=>true
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
    {label:'Cerrados y cobrados',value:counts.closed||0,kind:'closed'}
  ];
  const kindState=r=>{
    const badges=[];
    if(r.closed)badges.push('<span class="dash-tag ok">Cerrado · cobrado</span>');
    if(r.signed)badges.push('<span class="dash-tag ok">OT firmada</span>');
    else if(r.needsSignature)badges.push('<span class="dash-tag warn">Firma pendiente en trabajo activo</span>');
    else if(r.hasArchivedUnsignedOt)badges.push('<span class="dash-tag neutral">OT anterior sin PDF de firma vinculado</span>');
    if(r.invoiceSent)badges.push('<span class="dash-tag ok">Envío confirmado</span>');
    else if(r.invoiceRef)badges.push('<span class="dash-tag neutral">Factura registrada · envío no verificado</span>');
    else if(r.noInvoiceEvidence)badges.push('<span class="dash-tag warn">Factura sin vincular en Airtable</span>');
    else if(r.nonBillable)badges.push('<span class="dash-tag neutral">Intervención sin cargo</span>');
    if(r.paymentConfirmed)badges.push(`<span class="dash-tag ${r.paymentNeedsReconcile?'warn':'ok'}">Cobro verificado${r.paymentNeedsReconcile?' · conciliar':''}</span>`);
    else if(r.paidInCrm)badges.push('<span class="dash-tag ok">Cobrado según CRM</span>');
    else if(r.paidReported)badges.push('<span class="dash-tag neutral">Pagado según seguimiento · sin conciliar</span>');
    else if(r.needsPayment)badges.push('<span class="dash-tag warn">Cobro pendiente en CRM</span>');
    if(r.dataIncomplete)badges.push('<span class="dash-tag neutral">Datos por completar</span>');
    return badges.join('');
  };
  layout(`<div class="topbar"><div class="titleblock"><span class="eyebrow">Solo administración ASSA</span><h1>Panel de dirección</h1><p>Seguimiento de trabajos, órdenes firmadas, facturas y cobros registrados en Airtable.</p></div><span class="chip">● Datos de Airtable</span></div>
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
      <div class="dash-controls"><label><input type="checkbox" data-dashboard-confirm="invoiceSent" data-id="${h(r.id)}" ${r.invoiceSent?'checked':''}> Envío de factura confirmado</label>${r.paidInCrm?'<span class="dash-payment-ok">✓ Cobro registrado en CRM; no hace falta marcarlo otra vez</span>':`<label><input type="checkbox" data-dashboard-confirm="paymentConfirmed" data-id="${h(r.id)}" ${r.paymentConfirmed?'checked':''}> Cobro confirmado</label>`}</div>
      <div class="dash-card-actions"><button type="button" class="button small light" data-open-dashboard="${h(r.id)}">Ver trabajo</button>${r.signedPdf?`<a class="button small ghost" href="${h(r.signedPdf)}" target="_blank" rel="noopener noreferrer">📄 OT firmada</a>`:''}</div>
    </article>`).join(''):'<div class="empty"><div class="symbol">✓</div><h3>No hay trabajos en este filtro</h3><p>Prueba con otra categoría o modifica la búsqueda.</p></div>'}</div>
    <p class="smalltext dash-disclaimer-bottom">Las casillas son controles administrativos independientes. No crean ni editan facturas, importes cobrados o transferencias. Un cobro confirmado sin conciliación de importes queda señalado para revisar.</p>`);
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
function renderJobs(){const isAdmin=state.me.role==='administrador';let jobs=state.jobs.filter(x=>`${x.reference} ${x.client} ${x.address} ${x.description}`.toLowerCase().includes(state.search.toLowerCase()));if(state.status==='active')jobs=jobs.filter(x=>['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status));else jobs=jobs.filter(x=>!['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status));
 const active=state.jobs.filter(x=>['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status)).length;const completed=state.jobs.length-active;
 layout(`<div class="topbar"><div class="titleblock"><span class="eyebrow">Área de ${isAdmin?'administración':'operarios'}</span><h1>Mis trabajos</h1><p>${isAdmin?'Control de los trabajos de ASSA':'Consulta tus trabajos asignados y registra lo realizado'}</p></div><span class="chip">● Conectado</span></div><section class="kpis"><div class="kpi"><span>Activos</span><strong>${active}</strong></div><div class="kpi"><span>${isAdmin?'Cerrados / otros':'Mis trabajos'}</span><strong>${isAdmin?completed:active}</strong></div><div class="kpi"><span>Visitas</span><strong>↗</strong></div></section><div class="section-head"><h2>Listado de trabajos</h2><button class="button small primary" id="newVisit">+ Visita técnica</button></div>${isAdmin?`<div class="tabs"><button class="tab ${state.status==='active'?'active':''}" data-tab="active">Activos</button><button class="tab ${state.status==='closed'?'active':''}" data-tab="closed">Cerrados / otros</button></div>`:''}<div class="toolbar"><input id="search" placeholder="Buscar cliente, dirección o referencia" value="${h(state.search)}"/></div><div class="list">${jobs.length?jobs.map(job=>`<article class="job-card"><div><div class="ref">${h(job.reference||'Trabajo ASSA')}</div><h3>${h(job.client||'Cliente sin nombre')}</h3><p>📍 ${h(job.address||'Dirección pendiente')}</p><p>🔧 ${h(job.description||'Sin descripción')}</p><div class="foot"><span class="status ${['Aceptado / Programado','En progreso'].includes(job.status)?'on':'off'}">${h(job.status)}</span>${job.date?`<span class="smalltext">📅 ${h(job.date)}</span>`:''}${isAdmin&&job.assigned?`<span class="smalltext">👷 ${h(job.assigned)}</span>`:''}</div></div><button class="button small ${['Terminado','Facturado'].includes(job.status)?'light':'primary'}" data-open="${job.id}">Ver trabajo</button></article>`).join(''):`<div class="empty"><div class="symbol">✓</div><h3>No hay trabajos en este listado</h3><p>${isAdmin?'Cambia el filtro o asigna trabajos a los operarios.':'Cuando te asignen un trabajo, aparecerá aquí.'}</p></div>`}</div>`);
 el.querySelector('#newVisit').addEventListener('click',()=>navigate('visits'));el.querySelector('#search').addEventListener('input',e=>{state.search=e.target.value;const cursor=e.target.selectionStart;renderJobs();const input=el.querySelector('#search');input.focus();input.setSelectionRange(cursor,cursor);});el.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.status=b.dataset.tab;renderJobs();}));el.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.open)));}
async function openJob(id){try{state.job=(await api(`/jobs/${id}`)).job;state.reports=(await api(`/jobs/${id}/reports`)).reports;state.signedParts=(await api(`/jobs/${id}/signed`)).parts;state.page='work';if(state.me.role==='administrador'){state.employees=(await api('/employees')).employees;}render();}catch(e){toast(e.message,true);}}
function renderWork(){const job=state.job;if(!job)return navigate('jobs');const admin=state.me.role==='administrador';const report=state.reports.find(r=>r.user===state.me.username);const locked=!admin&&!['Aceptado / Programado','En progreso','Pendiente de visita'].includes(job.status);const signed=state.signedParts[0];const done=!!signed||report?.done||locked;
 const employees=state.employees.filter(x=>x.active&&x.role==='tecnico');const assigned=job.assigned.toLowerCase().split(/[,;\n]/).map(x=>x.trim());
 layout(`<button class="button ghost small" id="back">← Volver</button><div class="detail-head"><span class="eyebrow">${h(job.reference||'Trabajo de ASSA')}</span><h1>${h(job.client||'Cliente pendiente')}</h1><span class="status ${['Terminado','Facturado'].includes(job.status)?'off':'on'}">${h(job.status)}</span><div class="details-strip"><span>📍 ${h(job.address)}</span><span>📅 ${h(job.date||'Sin fecha')}</span>${job.phone?`<span>📞 ${h(job.phone)}</span>`:''}</div></div><section class="panel"><h2>Descripción del trabajo</h2><p>${h(job.description||'No se ha añadido descripción.')}</p></section>
 ${admin?`<section class='panel'><h2><span class='section-num'>📄</span>Preparación de OT</h2><p class='muted'>Los datos del cliente y el precio aceptado se toman de Airtable. Puedes completar información pendiente antes de la visita o después, sin modificar la firma original.</p><button type='button' class='button small light' id='otDetailsBtn'>Revisar / completar datos OT</button></section>`:''}
 ${admin?`<section class="panel"><h2><span class="section-num">👷</span>Asignar instaladores</h2><p class="muted">Solo verán los trabajos que les asignes y estén abiertos.</p><div class="switches">${employees.map(u=>`<label class="check-pill"><input type="checkbox" value="${h(u.username)}" class="assign" ${assigned.includes(u.username)?'checked':''}>${h(u.name||u.username)}</label>`).join('')||'No hay operarios. Crea sus cuentas en Empleados.'}</div><div class="actions"><button class="button small primary" id="saveAssign">Guardar asignación</button></div></section>`:''}
 <section class="panel"><h2><span class="section-num">01</span>Parte de ejecución</h2><p class="muted">Anota el trabajo real. Los costes y precios se calculan por separado en Airtable.</p>${done?`<div class="notice">✓ Este parte está cerrado. Solo administración conserva el historial.</div>`:''}<form id="reportForm"> <div class="grid2">${field('hours','Horas reales trabajadas',report?.hours??'','number','step="0.25" min="0" max="24" ' +(done?'disabled':''))}${field('date','Fecha del trabajo',report?.date||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),'date',done?'disabled':'')}</div>${area('material','Material utilizado',report?.material||'','Ejemplo: 2 metros de canaleta\n2 metros de cable\n8 codos de 18\nMedio tubo de 18')}${area('notes','Observaciones del instalador',report?.notes||'','Trabajo realizado, incidencias, pruebas, recomendaciones…')}<div class="form-field"><label for="photos">Fotografías del trabajo</label><input id="photos" type="file" accept="image/*" multiple ${done?'disabled':''}><small>Se comprimirán antes de subirlas a Airtable. No incluyas documentos sensibles.</small></div>${report?.photos?.length?`<div class="gallery">${report.photos.map((p,i)=>`<a href="${h(p.url)}" target="_blank" rel="noopener noreferrer">📷 Foto ${i+1}</a>`).join('')}</div>`:''}<div class="actions"><button type="submit" class="button primary" ${done?'disabled':''}>Guardar parte</button><button type="button" class="button danger" id="finish" ${done?'disabled':''}>✍️ Firmar y finalizar trabajo</button></div><div class="actions"><a class="button ghost" href="/api/jobs/${job.id}/ot?v=assa-ot-v5-20261104" target="_blank" rel="noopener noreferrer">📄 Ver OT ASSA (nuevo PDF)</a></div></form></section>
 ${renderWorkSigned(signed)}
 ${admin&&state.reports.length?`<section class="panel"><h2>Registro del equipo</h2>${state.reports.map(r=>`<div class="report"><strong>👷 ${h(r.user)}</strong> · ${h(r.hours)} h · ${r.done?'Cerrado':'En curso'}<div class="smalltext">${h(r.material||'Sin materiales')}</div><div class="smalltext">${h(r.notes||'Sin observaciones')}</div></div>`).join('')}</section>`:''}`);
 el.querySelector('#back').addEventListener('click',()=>navigate('jobs'));
 if(done){el.querySelectorAll('#reportForm input,#reportForm textarea').forEach(x=>x.disabled=true);}el.querySelector('#reportForm').addEventListener('submit',saveReport);
 el.querySelector('#finish').addEventListener('click',async()=>{try{await saveReport(null,true);state.otData=await api(`/jobs/${job.id}/ot-details`);state.page='sign';render();}catch(e){/* El guardado muestra el error. */}});
 if(admin)el.querySelector('#otDetailsBtn').addEventListener('click',async()=>{try{state.otData=await api(`/jobs/${job.id}/ot-details`);state.page='otDetails';render();}catch(e){toast(e.message,true);}});
 if(admin)el.querySelector('#saveAssign').addEventListener('click',async e=>{const users=[...el.querySelectorAll('.assign:checked')].map(x=>x.value);busy(e.target,true);try{await api(`/jobs/${job.id}/assign`,'PATCH',{users});toast('Instaladores asignados.');await openJob(job.id);}catch(err){toast(err.message,true);}finally{busy(e.target,false);}});
}
async function saveReport(event,forClose=false){event?.preventDefault();const form=el.querySelector('#reportForm');const btn=form.querySelector('[type=submit]');busy(btn,true);try{const data=formData(form);const files=[...form.querySelector('#photos').files];const res=await api(`/jobs/${state.job.id}/reports`,'POST',{hours:data.hours,date:data.date,material:data.material,notes:data.notes});for(let i=0;i<files.length;i++){toast(`Subiendo fotografía ${i+1} de ${files.length}…`);const photo=await compressImage(files[i]);await api(`/reports/${res.report.id}/photo`,'POST',photo);}state.reports=(await api(`/jobs/${state.job.id}/reports`)).reports;toast('Parte de trabajo guardado en Airtable.');if(!forClose)renderWork();return true;}catch(err){toast(err.message,true);throw err;}finally{busy(btn,false);}}
async function compressImage(file){if(!file.type.startsWith('image/'))throw new Error('Selecciona solo imágenes.');const bmp=await createImageBitmap(file);let scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close();let quality=.82;let blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',quality));while(blob?.size>4*1024*1024&&quality>.38){quality-=.14;blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',quality));}if(!blob||blob.size>4.8*1024*1024)throw new Error('La foto es demasiado grande.');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});return {filename:(file.name.replace(/\.[^.]+$/,'').replace(/[^\w.-]/g,'_').slice(0,65)||'foto')+'.jpg',contentType:'image/jpeg',file:base64};}
function renderVisits(){const options=state.jobs.filter(x=>['Aceptado / Programado','En progreso','Pendiente de visita'].includes(x.status)).map(j=>({value:j.id,label:`${j.client||'Cliente'} — ${j.reference||j.address}`}));
 layout(`<div class="titleblock"><span class="eyebrow">Formulario ASSA</span><h1>Visita técnica</h1><p>Registra los datos principales, medidas y fotografías desde tu móvil.</p></div><div class="warning">Los campos de la visita se guardan en la tabla original «VISITAS TÉCNICAS ASSA».</div><form id="visitForm"><section class="panel"><h2><span class="section-num">01</span>Visita rápida</h2>${select('job','Trabajo existente',options,'','Sin vincular · nueva visita')}${field('contact','Si no aparece: nombre y teléfono')}${field('title','¿Qué necesita el cliente?','','text','required')}${select('service','Servicio',['Fontanería','Electricidad','Gas','Calderas','Climatización','Fotovoltaica','Aerotermia','Tratamiento de agua','Otros'])}${field('address','Dirección · calle, piso y población','','text','required')}${area('measures','Medidas · indica unidades (m, cm, Ø…)','', 'Longitud, altura, diámetros, recorridos…')}${area('material','Materiales · cantidad y modelo','', 'Lista y cantidades estimadas')}${select('next','Siguiente paso',['Preparar presupuesto','Faltan datos','Requiere otra visita','Solo registrar visita'])}<div class="form-field"><label for="photos">Fotos de la visita</label><input type="file" id="photos" accept="image/*" multiple><small>Adjunta varias fotografías desde Android.</small></div></section><section class="panel"><h2><span class="section-num">02</span>Opcional: detalles de la visita</h2>${area('access','Incidencias y acceso')}${field('workers','Operarios estimados','','number','min="0" max="30"')}${field('hours','Horas estimadas por operario','','number','min="0" step="0.25"')}${area('notes','Notas')}<div class="pale">La fecha y el técnico se registran automáticamente.</div></section><div class="actions"><button type="submit" class="button primary">Guardar visita y fotografías</button></div></form>`);
 el.querySelector('#visitForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.target;const btn=form.querySelector('[type=submit]');busy(btn,true);try{const data=formData(form);const files=[...form.querySelector('#photos').files];const created=await api('/visits','POST',{...data});for(let i=0;i<files.length;i++){toast(`Subiendo fotografía ${i+1} de ${files.length}…`);await api(`/visits/${created.id}/photo`,'POST',await compressImage(files[i]));}toast('Visita guardada en Airtable correctamente.');form.reset();}catch(e){toast(e.message,true);}finally{busy(btn,false);}});
}
function renderUsers(){if(state.me.role!=='administrador')return navigate('jobs');layout(`<div class="titleblock"><span class="eyebrow">Administración</span><h1>Equipo ASSA</h1><p>Gestiona los accesos de tus trabajadores. No necesitan ChatGPT.</p></div><section class="panel"><h2>Crear acceso de instalador</h2><form id="userForm"><div class="grid2">${field('name','Nombre del empleado','','text','required')}${field('username','Usuario de acceso','','text','required pattern="[a-z][a-z0-9_-]{2,29}"')}</div>${field('password','Contraseña inicial (12 caracteres mínimo)','','password','required minlength="12" autocomplete="new-password"')}<div class="actions"><button class="button primary" type="submit">Crear usuario</button></div></form></section><section class="panel"><h2>Empleados registrados</h2>${state.employees.length?state.employees.map(u=>`<div class="job-card" style="align-items:center;margin:10px 0"><div><strong>${h(u.name||u.username)}</strong><div class="smalltext">@${h(u.username)} · ${h(u.role)}</div></div><button class="button small ${u.active?'danger':'primary'}" data-toggle="${u.id}" data-active="${u.active}">${u.active?'Desactivar':'Activar'}</button></div>`).join(''):'<p class="muted">Todavía no hay empleados creados.</p>'}</section>`);
 el.querySelector('#userForm').addEventListener('submit',async ev=>{ev.preventDefault();const btn=ev.target.querySelector('button');busy(btn,true);try{await api('/employees','POST',formData(ev.target));toast('Empleado creado. Ya puedes facilitarle su usuario y contraseña.');await navigate('users');}catch(e){toast(e.message,true);}finally{busy(btn,false);}});
 el.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/employees/${b.dataset.toggle}/active`,'PATCH',{active:b.dataset.active!=='true'});await navigate('users');toast('Acceso actualizado.');}catch(e){toast(e.message,true);}}));
}
function renderWorkSigned(part){
 if(!part)return '';
 return `<section class="panel"><h2><span class="section-num">✍️</span>Parte firmado por el cliente</h2><div class="notice">✓ Documento firmado y archivado en Airtable · ${h(part.number)}</div>${part.file?.url?`<a class="button primary" target="_blank" rel="noopener noreferrer" href="${h(part.file.url)}">📄 Ver PDF firmado</a>`:'<p class="muted">El PDF está archivado en Airtable.</p>'}</section>`;
}
function renderSign(){
 const job=state.job;
 if(!job)return navigate('jobs');
 const report=state.reports.find(r=>r.user===state.me.username)||state.reports.find(r=>!r.done)||state.reports[0];
 if(!report){state.page='work';render();return toast('Guarda el parte antes de firmarlo.',true);}
 layout(`<button class="button ghost small" id="backSign">← Volver al trabajo</button>
 <div class="titleblock"><span class="eyebrow">Parte de trabajo ASSA</span><h1>Firma del cliente</h1><p>Muestra al cliente el trabajo realizado y pídele que firme en la pantalla.</p></div>
 <div class="actions"><a class="button ghost" target="_blank" rel="noopener noreferrer" href="/api/jobs/${job.id}/ot?v=assa-ot-v5-20261104">📄 Ver OT ASSA (nuevo PDF) antes de firmar</a></div>
 <section class="panel"><h2>Resumen de la intervención</h2>
 <p><strong>Cliente:</strong> ${h(job.client||'Cliente')}<br><strong>Trabajo:</strong> ${h(job.reference||'Trabajo ASSA')}<br><strong>Dirección:</strong> ${h(job.address||'A confirmar')}<br><strong>Horas:</strong> ${h(report.hours??'Sin indicar')}</p>
 <div class="pale"><strong>Trabajo solicitado</strong><p>${h(job.description||'Sin descripción')}</p></div>
 <h3>Trabajo realizado y observaciones</h3><p class="signature-summary">${h(report.notes||'Sin observaciones adicionales')}</p>
 <h3>Material empleado</h3><p class="signature-summary">${h(report.material||'Sin material detallado')}</p></section>
 <form id="signatureForm"><section class="panel"><h2><span class="section-num">✍️</span>Recepción y firma</h2>
 ${field('signer','Nombre y apellidos de quien firma','','text','required minlength="3" maxlength="120" autocomplete="name"')}
 ${field('signAddress','Dirección del trabajo',state.otData?.info?.address||job.address||'','text','maxlength="220"')}
 ${area('customerNotes','Observaciones del cliente (si las hay)','','Incidencias pendientes, reservas o comentarios…')}
 <p class="muted">Firmando confirmo que se me ha mostrado este parte y que reconozco la realización de la intervención descrita. La firma no sustituye una factura ni limita garantías o derechos.</p>
 <div class="form-field"><label>Firma en la pantalla</label><canvas id="signatureCanvas" class="signature-canvas" width="960" height="280" aria-label="Zona para firmar con el dedo"></canvas><small>Firma con el dedo. Puedes borrar y repetir.</small></div>
 <button type="button" class="button light small" id="clearSignature">Borrar firma</button>
 <label class="signature-check"><input type="checkbox" id="signatureConsent" required> He revisado el parte y confirmo su recepción.</label>
 <div class="warning">Al confirmar, se generará el PDF firmado en Airtable y el trabajo pasará a «Terminado». Para los operarios desaparecerá de trabajos activos.</div>
 <div class="actions"><button class="button primary" type="submit">✓ Guardar firma y terminar trabajo</button></div></section></form>`);
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
 layout(`<div class="titleblock"><span class="eyebrow">ASSA Instalaciones</span><h1>Trabajo terminado y firmado</h1></div>
 <section class="panel signed-success"><div class="signed-check">✓</div><h2>Parte firmado y archivado</h2>
 <p>El documento ${h(part.number||'')} está registrado en Airtable. Administración conserva una copia, y el trabajo ya no aparecerá entre los activos del instalador.</p>
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
    ${entry.signed?'<div class="notice">Este trabajo ya tiene un PDF firmado. Puedes completar los datos administrativos, pero el documento firmado no se modificará.</div>':''}
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
init();