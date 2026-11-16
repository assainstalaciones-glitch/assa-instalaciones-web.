export function financeScreen({layout,api,h,toast,today,canWrite}){
 let data=null,operationId=crypto.randomUUID(),costOperationId=crypto.randomUUID();
 const money=n=>Number(n).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 const initial={from:today.slice(0,7)+'-01',to:today,group:'month'};
 function input(name,label,type='text',required=true,value=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" '+(required?'required ':'')+'value="'+h(value)+'" '+(type==='number'?'min="0" step="0.01"':'')+'></label>';}
 async function refresh(filters=initial){data=await api('/admin/finance?'+new URLSearchParams(filters));render();}
 function render(){
 const periodLabel=p=>data.group==='month'?new Date(p+'-01T00:00:00Z').toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}):(data.group==='week'?'Semana del ':'')+p.split('-').reverse().join('/');
 const outcome=n=>n===null?'Pendiente de conciliar':money(n);
 layout('<div class="topbar"><div class="titleblock"><span class="eyebrow">Solo administración</span><h1>Cobros y gastos</h1><p>Consulta lo recibido y los gastos de cada periodo.</p></div></div>'+
 '<section class="panel"><form id="finance-filter" class="finance-grid">'+input('from','Desde','date',true,data.from)+input('to','Hasta','date',true,data.to)+
 '<label>Agrupar<select name="group">'+[['day','Días'],['week','Semanas (lunes)'],['month','Meses']].map(([v,t])=>'<option value="'+v+'" '+(data.group===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label><button class="button" type="submit">Consultar</button></form></section>'+
 '<section class="panel"><h2>Cobrados y pendientes · trabajos de ASSA</h2><p>Importes con IVA, según las fichas de Airtable. Es una vista histórica general, no limitada por las fechas del filtro. No equivale a verificar cada ingreso en el banco.</p>'+
 '<div class="finance-cards">'+[['Cobrado según trabajos',data.crm.totals.paid],['Pendiente según trabajos',data.crm.totals.pending]].map(([name,n])=>'<article class="panel"><h2>'+h(name)+'</h2><strong class="finance-amount">'+money(n)+'</strong></article>').join('')+'</div>'+
 '<details open><summary>Cobrados ('+data.crm.paid.length+')</summary><p>Un pago parcial también figura en pendientes por lo que falta. Los pagos sin fecha real no se atribuyen a ningún mes.</p>'+
 '<div class="finance-scroll"><table class="finance-table"><thead><tr><th>Trabajo</th><th>Cobrado con IVA</th><th>Estado</th><th>Factura</th></tr></thead><tbody>'+
 (data.crm.paid.map(x=>'<tr><td>'+h(x.concept)+'</td><td>'+money(x.paid)+'</td><td>'+(x.partial?'Parcial':'Cobrado')+'</td><td>'+h(x.invoice||'Sin referencia')+'</td></tr>').join('')||'<tr><td colspan="4">No constan cobros en las fichas.</td></tr>')+
 '</tbody></table></div></details>'+
 '<details open><summary>Pendientes de cobro ('+data.crm.pending.length+')</summary><p>Se incluyen trabajos con importe pendiente y factura registrada, identificados como pendientes, parciales o facturados. No se incluyen presupuestos enviados sin aceptar.</p>'+
 '<div class="finance-scroll"><table class="finance-table"><thead><tr><th>Trabajo</th><th>Pendiente con IVA</th><th>Estado</th><th>Factura</th></tr></thead><tbody>'+
 (data.crm.pending.map(x=>'<tr><td>'+h(x.concept)+'</td><td>'+money(x.remaining)+'</td><td>'+h(x.status)+'</td><td>'+h(x.invoice)+'</td></tr>').join('')||'<tr><td colspan="4">No hay deudas identificadas con este criterio.</td></tr>')+
 '</tbody></table></div></details>'+
 '<p><strong>'+data.crm.missingPaymentDates+' trabajos cobrados necesitan desglose de fechas.</strong> No se trasladan automáticamente a la tabla por mes, para no inventar cuándo se recibió el dinero.</p></section>'+
 '<section class="panel"><h2>Disponible para reinvertir</h2><strong class="finance-amount">No calculable todavía</strong>'+
 '<p>Faltan extractos bancarios, fechas de los cobros, pagos pendientes a proveedores, impuestos y reserva de seguridad. No se debe usar el resultado estimado para comprometer compras ni reformas.</p></section>'+
  '<section class="panel" id="finance-reconcile"><h2>Por conciliar · '+data.crm.toReconcile.length+' trabajos</h2>'+
 '<p>Selecciona un trabajo y registra cada abono con su fecha real y evidencia. <strong>No uses la fecha de la factura o de ejecución como fecha de pago.</strong> El importe indicado es el máximo que falta fechar, no necesariamente un único pago.</p>'+
 '<div class="finance-queue">'+(data.crm.toReconcile.map(x=>'<article class="finance-queue-item"><div><strong>'+h(x.concept)+'</strong><p>Factura '+h(x.invoice||'sin vincular')+' · '+money(x.missing)+' por fechar (IVA incl.)</p></div>'+
 (canWrite?'<button type="button" class="button light small" data-reconcile-job="'+h(x.id)+'">Registrar abono</button>':'')+'</article>').join('')||
 '<p>Los cobros registrados en TRABAJOS ya están fechados en el auxiliar.</p>')+'</div></section>'+
  '<section class="panel"><h2>Resultado por día, semana o mes</h2>'+
 (data.crm.unassignedGross>0?'<p class="finance-clarification"><strong>'+money(data.crm.unassignedGross)+' cobrados según trabajos, aún sin fecha de ingreso desglosada (IVA incluido).</strong> No se pueden asignar con seguridad a octubre o noviembre. Por eso el resultado de los periodos aparece pendiente, no como una pérdida ficticia.</p>':'')+
 '<p>Los ingresos de esta tabla sólo incluyen pagos con fecha real registrada en el auxiliar. Los gastos son bases sin IVA y pueden incluir previsiones. Nunca mezclamos el total cobrado con IVA con el gasto sin IVA.</p>'+
 '<div class="finance-cards">'+[['Cobros fechados sin IVA',money(data.totals.collected)],['Gastos del periodo sin IVA',money(data.totals.expenses)],['Resultado del periodo',outcome(data.totals.result)]].map(([name,value])=>'<article class="panel"><h2>'+h(name)+'</h2><strong class="finance-amount">'+h(value)+'</strong></article>').join('')+'</div>'+
 '<p><strong>Gastos fijos previstos incluidos: '+money(data.totals.estimated)+'.</strong> Son importes prorrateados, no necesariamente facturas ya pagadas. Las facturas reales de un gasto fijo sustituyen su previsión para evitar duplicados.</p>'+
 '<div class="finance-periods">'+data.rows.map(r=>'<article class="finance-period"><h3>'+h(periodLabel(r.period))+'</h3>'+
 '<div class="finance-period-stat"><span>Cobros con fecha · sin IVA</span><strong>'+money(r.collected)+'</strong></div>'+
 '<div class="finance-period-stat"><span>Gastos previstos y registrados · sin IVA</span><strong>'+money(r.expenses)+'</strong></div>'+
 '<div class="finance-period-stat"><span>De ellos, estimados</span><strong>'+money(r.estimated)+'</strong></div>'+
 '<div class="finance-period-stat finance-period-result"><span>Resultado</span><strong>'+h(outcome(r.result))+'</strong></div>'+
 '</article>').join('')+'</div>'+
 '<p class="finance-small-print">Un 0 € en «cobros con fecha» significa que no hay pagos fechados para ese periodo; no significa que ASSA no haya cobrado. El resultado no es beneficio contable ni saldo bancario.</p></section>'+
 '<section class="panel"><h2>Calidad de la información</h2>'+
 '<p><strong>'+data.quality.costCoverage.complete+' de '+data.quality.costCoverage.jobs+' trabajos terminados en este periodo</strong> tienen campos de materiales, otros costes y horas o mano de obra cumplimentados. Sin ellos no es posible calcular el margen real por trabajo.</p>'+
 (data.quality.costCoverage.missing.length?'<details><summary>Trabajos con costes por completar ('+data.quality.costCoverage.missing.length+(data.quality.costCoverage.jobs-data.quality.costCoverage.complete>40?'+':'')+')</summary><ul>'+
 data.quality.costCoverage.missing.map(x=>'<li>'+h(x.concept)+' '+(canWrite?'<button type="button" class="button light small" data-cost-job="'+h(x.id)+'">Revisar costes</button>':'')+'</li>').join('')+'</ul></details>':'')+
 '<details><summary>Gastos fijos registrados ('+data.quality.fixedDetails.length+')</summary><p>Importes mensuales equivalentes sin IVA. Una previsión no acredita una factura pagada. No duplicar nóminas y coste horario en el resultado de empresa.</p>'+
 '<div class="finance-queue">'+data.quality.fixedDetails.map(x=>'<div class="finance-queue-item"><span>'+h(x.concept)+' · '+h(x.status)+'</span><strong>'+(x.monthly===null?'Sin importe':money(x.monthly)+'/mes')+'</strong></div>').join('')+'</div></details>'+
 '<div class="actions"><button type="button" class="button light small" data-nav="reconciliation">Ver conciliación de facturas</button></div></section>'+
 (canWrite&&data.quality.costCoverage.missing.length?'<section class="panel"><details id="finance-costs-details"><summary>Registrar costes directos comprobados</summary>'+
 '<p>Solo para trabajos ejecutados con fecha en el periodo seleccionado. No se modifican facturas. No rellenes con cero los importes desconocidos. Si ya existe un coste distinto, el sistema bloqueará su sobrescritura.</p>'+
 '<form id="finance-cost-entry"><div class="finance-grid">'+
 '<label>Trabajo<select name="jobId" required><option value="">Elige trabajo</option>'+data.quality.costCoverage.missing.map(x=>'<option value="'+h(x.id)+'">'+h(x.concept)+'</option>').join('')+'</select></label>'+
 input('saleNet','Venta verificada · base sin IVA','number',false)+
 input('material','Materiales/equipos consumidos · sin IVA','number',false)+
 input('other','Otros costes directos · sin IVA','number',false)+
 input('hours','Horas-persona reales verificadas','number',false)+
 input('hourRate','Coste por hora confirmado (€/hora)','number',false)+
 '<label>Evidencia: nº factura, albarán, parte o documento de respaldo<textarea name="evidence" required minlength="12" maxlength="1800"></textarea></label>'+
 '<input type="hidden" name="expectedRevision" value=""></div>'+
 '<p>Si indicas horas, confirma el coste horario real. La referencia de ASSA es 20 €/h productiva, pero debes comprobar que corresponde al trabajo. No incluyas dos veces salarios como coste directo y gasto fijo al calcular resultados globales.</p>'+
 '<label><input type="checkbox" name="confirmed" required> He contrastado estos costes con documentos, no son estimaciones ni supuestos.</label>'+
 '<p><button class="button primary" type="submit">Guardar costes revisados</button></p></form></details></section>':'')+
 (canWrite?'<section class="panel"><details><summary>Registrar un cobro o una factura de gasto</summary><p>Un registro por pago parcial. Introduce solo el importe recibido y su fecha real. Para gastos, usa fecha de factura. No se cambia la factura ni el cobro acumulado del trabajo.</p><form id="finance-entry"><div class="finance-grid">'+
 '<label>Tipo<select name="type"><option>Cobro</option><option>Gasto</option></select></label>'+input('date','Fecha real del cobro o de la factura','date',true,'')+input('concept','Concepto')+input('party','Cliente o proveedor')+input('reference','Factura / referencia del pago')+
 input('total','Total del movimiento con IVA','number')+
 '<label>Tipo de IVA comprobado en la factura<select id="finance-vat-rate"><option value="">Indicar manualmente</option><option value="21">21 %</option><option value="10">10 %</option><option value="4">4 %</option><option value="0">0 %</option></select></label>'+
 input('base','Base del movimiento sin IVA','number')+input('vat','IVA del movimiento','number')+
 '<label>Trabajo (opcional)<select name="jobId"><option value="">Sin vincular</option>'+data.jobOptions.map(x=>'<option value="'+h(x.id)+'">'+h(x.concept)+'</option>').join('')+'</select></label>'+
 '<label>Sustituye gasto fijo (solo gastos)<select name="fixedId"><option value="">No: gasto adicional</option>'+data.fixedOptions.map(x=>'<option value="'+h(x.id)+'">'+h(x.concept)+'</option>').join('')+'</select></label>'+
 input('fixedMonth','Mes del gasto fijo (solo si sustituye previsión)','month',false)+
 '<label>Evidencia / enlace / confirmación<textarea name="evidence" required maxlength="2000"></textarea></label></div>'+
 '<p>Si seleccionas un porcentaje de IVA, se calcula una propuesta de base e impuesto a partir del total. <strong>Comprueba que coincide con la factura</strong>, especialmente si incluye distintos tipos de IVA. Si sustituye un gasto fijo, introduce el total real consolidado del concepto y mes. No registres el mismo gasto dos veces.</p>'+
 '<label><input type="checkbox" name="confirmed" required> He comprobado documento, fecha real de pago/factura, importe y que no existe duplicado.</label><p><button class="button" type="submit">Guardar movimiento</button></p></form></details></section>':'')+
 '<section class="panel"><details '+(data.warnings.length?'open':'')+'><summary>Incidencias de datos ('+data.warnings.length+')</summary><p>Estos avisos pueden pertenecer a otros periodos; no se asignan fechas por suposición.</p><ul>'+data.warnings.map(w=>'<li><strong>'+h(w.concept)+'</strong>: '+h(w.reason)+'</li>').join('')+'</ul></details></section>'+
 '<section class="panel"><details><summary>Detalle de movimientos reales del periodo</summary><div class="finance-scroll"><table class="finance-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Base sin IVA</th><th>Referencia</th></tr></thead><tbody>'+data.events.map(e=>'<tr><td>'+h(e.date)+'</td><td>'+h(e.type)+'</td><td>'+h(e.concept)+'</td><td>'+money(e.base)+'</td><td>'+h(e.reference)+'</td></tr>').join('')+'</tbody></table></div></details></section>');
 document.querySelector('#finance-filter').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await refresh(Object.fromEntries(new FormData(e.target)));}catch(err){toast(err.message,true);}finally{b.disabled=false;}};
 const costForm=document.querySelector('#finance-cost-entry');
 if(costForm){
  const pick=()=>{
   const item=data.quality.costCoverage.missing.find(x=>x.id===costForm.elements.jobId.value);
   for(const key of ['saleNet','material','other','hours'])costForm.elements[key].value=item?.costs?.[key]??'';
   costForm.elements.expectedRevision.value=item?.expectedRevision||'';
   costForm.elements.hourRate.value='';
   costForm.elements.evidence.value='';
   costForm.elements.confirmed.checked=false;
  };
  costForm.elements.jobId.addEventListener('change',pick);
  document.querySelectorAll('[data-cost-job]').forEach(button=>button.addEventListener('click',()=>{
   const details=document.querySelector('#finance-costs-details');details.open=true;
   costForm.elements.jobId.value=button.dataset.costJob;pick();
   details.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  costForm.addEventListener('submit',async e=>{
   e.preventDefault();const btn=e.submitter;btn.disabled=true;
   const b=Object.fromEntries(new FormData(costForm));for(const key of ['saleNet','material','other','hours','hourRate']){
    if(b[key]==='')delete b[key];else b[key]=Number(b[key]);
   }
   b.operationId=costOperationId;
   try{
    await api('/admin/finance/job-costs','POST',b);
    costOperationId=crypto.randomUUID();
    toast('Costes registrados con evidencia; ninguna factura modificada.');
    await refresh({from:data.from,to:data.to,group:data.group});
   }catch(err){toast(err.message,true);}
   finally{btn.disabled=false;}
  });
 }
 const form=document.querySelector('#finance-entry');
 if(form){
  const rate=document.querySelector('#finance-vat-rate');
  const suggestTax=()=>{if(rate.value==='')return;const total=Number(form.elements.total.value);
   if(!Number.isFinite(total)||total<=0)return;
   const base=Math.round((total/(1+Number(rate.value)/100))*100)/100;
   form.elements.base.value=base.toFixed(2);form.elements.vat.value=(Math.round(total*100)/100-base).toFixed(2);
  };
  rate.addEventListener('change',suggestTax);form.elements.total.addEventListener('input',suggestTax);
 }
 document.querySelectorAll('[data-reconcile-job]').forEach(button=>button.addEventListener('click',()=>{
  if(!form)return;const item=data.crm.toReconcile.find(x=>x.id===button.dataset.reconcileJob);if(!item)return;
  form.closest('details').open=true;form.elements.type.value='Cobro';form.elements.jobId.value=item.id;
  form.elements.concept.value='Abono de '+item.concept;
  form.elements.party.value='';form.elements.reference.value=item.invoice||'';
  form.elements.date.value='';form.elements.total.value='';form.elements.base.value='';form.elements.vat.value='';
  form.elements.evidence.value='';form.elements.fixedId.value='';form.elements.fixedMonth.value='';
  document.querySelector('#finance-vat-rate').value='';
  form.elements.confirmed.checked=false;
  form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.date.focus();
 }));
 if(form)form.onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;const fields=Object.fromEntries(new FormData(form));for(const k of ['base','vat','total'])fields[k]=Number(fields[k]);fields.operationId=operationId;try{await api('/admin/finance','POST',fields);operationId=crypto.randomUUID();form.reset();toast('Movimiento guardado; ninguna factura modificada.');await refresh({from:data.from,to:data.to,group:data.group});}catch(err){toast(err.message,true);}finally{b.disabled=false;}};
 }
 return refresh();
}
