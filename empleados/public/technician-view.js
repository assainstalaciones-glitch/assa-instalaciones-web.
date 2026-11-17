// Vista de consulta para instaladores. No permite escribir importes, partes ni cierres.
export function renderTechnicianWork({job,layout,h,el,jobContactActions,navigate}){
 const heading=job.client||job.reference||'Trabajo ASSA';
 const time=job.start?(job.start+(job.end?'–'+job.end:'')):'Hora por confirmar';
 layout('<button type="button" class="button ghost small" id="back">← Volver a mis trabajos</button>'+
 '<div class="detail-head"><span class="eyebrow">Hoja de ruta · ASSA</span><h1>'+h(heading)+'</h1>'+
 '<span class="chip">'+h(job.status||'Pendiente')+'</span></div>'+
 '<section class="panel"><h2>Tu trabajo</h2>'+
 '<div class="tech-route-row"><strong>Fecha y hora</strong><span>'+h(job.date||'Sin fecha confirmada')+' · '+h(time)+'</span></div>'+
 '<div class="tech-route-row"><strong>Equipo</strong><span>'+h(job.team||job.assigned||'Pendiente de confirmar reparto')+'</span></div>'+
 '<div class="tech-route-row"><strong>Dirección</strong><span>'+h(job.address||'Dirección pendiente de confirmar')+'</span></div>'+
 '<div class="tech-route-row"><strong>Contacto</strong><span>'+h(job.accessPhone||job.phone||'Teléfono pendiente')+'</span></div>'+
 jobContactActions(job)+
 '</section><section class="panel"><h2>Trabajo a realizar</h2><p class="tech-instructions">'+h(job.description||job.reference||'Consultar con Dirección antes de empezar.')+'</p></section>'+
 '<section class="panel"><h2>Al terminar</h2><p>Envía a Samuel por el canal habitual las fotografías y los tickets o gastos de material. No necesitas rellenar formularios en esta app.</p>'+
 '<p class="smalltext">Si surge una incidencia o cambia el trabajo previsto, contacta con Samuel antes de continuar.</p></section>');
 el.querySelector('#back')?.addEventListener('click',()=>navigate('jobs'));
}
