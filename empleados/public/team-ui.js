import { ASSA_TEAMS, mondayISO, addDaysISO, buildTeamWeek, DAILY_CAPACITY_MINUTES } from './team-planning.js';

function timeText(m){
  if(!Number.isFinite(m))return 'Sin calcular';
  const hours=Math.floor(m/60),minutes=m%60;
  return (hours?hours+' h':'')+(minutes?(hours?' ':'')+minutes+' min':'')||'0 min';
}
function dateTitle(iso){
  return new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
}
function workItem(job,h,withEdit){
  const name=job.client||job.reference||'Trabajo ASSA';
  const time=job.start?(job.start+(job.end?'–'+job.end:' · fin sin confirmar')):'Hora por confirmar';
  const selector=withEdit?'<div class="team-assign-actions"><select aria-label="Equipo responsable de '+h(name)+'" data-team-select="'+h(job.id)+'"><option value="">Sin equipo confirmado</option>'+ASSA_TEAMS.map(t=>'<option value="'+h(t.id)+'" '+(job.team===t.id?'selected':'')+'>'+h(t.short+' · '+t.people)+'</option>').join('')+'</select><button type="button" class="button small primary" data-team-save="'+h(job.id)+'">Guardar equipo</button></div>':'';
  return '<article class="team-job"><div class="team-job-head"><span>'+h(time)+'</span><span class="dash-tag neutral">'+h(job.status||'Pendiente')+'</span></div><strong>'+h(name)+'</strong><p>'+h(job.reference&&job.client?job.reference:job.description||'Sin descripción')+'</p><div class="team-job-actions"><button type="button" class="button ghost small" data-team-open="'+h(job.id)+'">Abrir ficha</button></div>'+selector+'</article>';
}

export function renderTeamScreen({state,layout,api,h,el,openJob,loadJobs,toast,madridToday}){
  if(state.me?.role!=='administrador')return;
  const today=madridToday();
  state.teamWeek=state.teamWeek||mondayISO(today);
  const week=buildTeamWeek(state.jobs,state.teamWeek,today,state.agendaNotes);
  const canEdit=!!state.me.canManageRecords;
  const overview=week.days.map(day=>'<section class="panel team-day"><div class="section-head"><h2>'+h(dateTitle(day.date))+'</h2><span class="smalltext">'+day.unassigned.length+' sin equipo confirmado</span></div><div class="team-grid">'+day.teams.map(team=>{
    const reliable=!team.unknown.length&&!day.unassigned.length;
    const freeLabel=reliable?timeText(team.freeMinutes)+' de capacidad sin reservar':'Capacidad sin confirmar';
    const notice=team.conflicts.length?'<p class="team-alert">⚠ '+team.conflicts.length+' solape(s) de trabajos del mismo equipo</p>':'';
    const unknown=team.unknown.length?'<p class="smalltext">⚠ '+team.unknown.length+' trabajo(s) sin horario completo: la capacidad no es verificable.</p>':'';
    const external=team.outsideHours.length?'<p class="smalltext">Hay trabajo fuera de la jornada orientativa.</p>':'';
    const commercial=team.id===ASSA_TEAMS[0].id?day.commercial.map(n=>'<div class="team-commercial"><strong>📝 '+h(n.start+'–'+n.end)+' · '+h(n.title)+'</strong><p>Bloque de Samuel reservado en Airtable para visitas o presupuestos.</p></div>').join(''):'';
    return '<div class="team-column"><div class="team-column-head"><strong>'+h(team.short)+'</strong><span>'+h(team.people)+'</span><p class="smalltext">'+h(freeLabel)+'</p><div class="team-meter"><span style="width:'+Math.round(team.busyMinutes/DAILY_CAPACITY_MINUTES*100)+'%"></span></div></div>'+notice+unknown+external+commercial+(team.jobs.length?team.jobs.map(j=>workItem(j,h,canEdit)).join(''):'<p class="smalltext team-blank">Sin trabajos asignados en Airtable.</p>')+'</div>';
  }).join('')+'</div>'+(day.unassigned.length?'<div class="team-unassigned"><h3>Sin equipo asignado · '+day.unassigned.length+'</h3><p class="smalltext">Estos trabajos pueden ocupar cualquiera de los dos equipos. No se consideran tiempo libre.</p>'+day.unassigned.map(j=>workItem(j,h,canEdit)).join('')+'</div>':'')+'</section>').join('');
  layout('<div class="topbar"><div class="titleblock"><span class="eyebrow">Solo Dirección · ASSA</span><h1>Equipos y capacidad semanal</h1><p>Samuel + César y Alex + Saúl. Asignaciones manuales con control de conflictos.</p></div><button class="button light small" id="teamsRefresh">↻ Actualizar</button></div>'+
    '<section class="panel"><div class="team-week-toolbar"><button class="button light small" id="teamsPrevious">← Anterior</button><strong>Semana del '+h(week.days[0]?.date||'')+'</strong><button class="button light small" id="teamsNext">Siguiente →</button><button class="button ghost small" id="teamsCurrent">Esta semana</button></div>'+
    '<div class="dash-kpis"><div class="dash-kpi"><span>Trabajos sin reparto esta semana</span><strong>'+week.unassignedCount+'</strong></div><div class="dash-kpi"><span>Solapes detectados</span><strong>'+week.conflictCount+'</strong></div><div class="dash-kpi"><span>Horarios incompletos</span><strong>'+week.uncertaintyCount+'</strong></div><div class="dash-kpi"><span>Fechas vencidas por revisar</span><strong>'+week.overdue.length+'</strong></div></div>'+
    '<p class="smalltext">Capacidad orientativa: 08:30–14:00 y 15:00–18:00 (8 h 30 por equipo). La barra contabiliza trabajos asignados y bloques comerciales de Samuel registrados en Airtable. No incluye desplazamientos, pausas diferentes, ni visitas o bloques que consten solo en Google Calendar. Un hueco mostrado no garantiza disponibilidad.</p></section>'+
    overview+
    (week.undated.length?'<section class="panel"><h2>Trabajos abiertos sin fecha · '+week.undated.length+'</h2>'+week.undated.slice(0,12).map(j=>workItem(j,h,canEdit)).join('')+(week.undated.length>12?'<p class="smalltext">Se muestran los primeros 12. Revisa el listado general para los demás.</p>':'')+'</section>':'')+
    '<section class="panel"><h2>Fechas pasadas y cierre por verificar · '+week.overdue.length+'</h2><p class="smalltext">Son trabajos aún abiertos en Airtable con fecha anterior a hoy. No significa que se hayan incumplido o que no se hayan realizado.</p>'+
    (week.overdue.length?week.overdue.slice(0,15).map(j=>'<div class="team-overdue"><span>'+h(j.date)+' · '+h(j.status)+'</span><button class="button ghost small" data-team-open="'+h(j.id)+'">'+h(j.client||j.reference||'Trabajo')+'</button></div>').join(''):'<p class="smalltext">Sin fechas vencidas por revisar.</p>')+
    '</section>');
  const rerender=()=>renderTeamScreen({state,layout,api,h,el,openJob,loadJobs,toast,madridToday});
  el.querySelector('#teamsPrevious')?.addEventListener('click',()=>{state.teamWeek=addDaysISO(state.teamWeek,-7);rerender();});
  el.querySelector('#teamsNext')?.addEventListener('click',()=>{state.teamWeek=addDaysISO(state.teamWeek,7);rerender();});
  el.querySelector('#teamsCurrent')?.addEventListener('click',()=>{state.teamWeek=mondayISO(today);rerender();});
  el.querySelector('#teamsRefresh')?.addEventListener('click',async e=>{
    e.target.disabled=true;
    try{await loadJobs();rerender();toast('Trabajos actualizados desde Airtable.');}
    catch(error){e.target.disabled=false;toast(error.message,true);}
  });
  el.querySelectorAll('[data-team-open]').forEach(b=>b.addEventListener('click',()=>openJob(b.dataset.teamOpen)));
  el.querySelectorAll('[data-team-save]').forEach(button=>button.addEventListener('click',async()=>{
    if(!canEdit)return;
    const job=state.jobs.find(x=>x.id===button.dataset.teamSave);
    const select=el.querySelector('[data-team-select="'+button.dataset.teamSave+'"]');
    if(!job||!select)return;
    const team=select.value;
    if(team===(job.team||''))return toast('La asignación ya está guardada.');
    const matching=week.days.find(d=>d.date===job.date);
    const other=matching?.teams.find(t=>t.id===team)?.jobs||[];
    const potentialConflict=other.some(o=>o.id!==job.id&&o.start&&job.start&&(!o.end||!job.end||o.start<job.end&&job.start<o.end));
    if(!confirm('¿'+(team?'Asignar a '+team:'Dejar sin equipo confirmado')+' el trabajo "'+(job.reference||job.client)+'"?'+(potentialConflict?'\n⚠ Hay otra intervención de ese equipo con posible solapamiento. Revisa el reparto.':'')))return;
    button.disabled=true;
    try{const result=await api('/admin/jobs/'+job.id+'/team','PATCH',{team,expectedTeam:job.team||''});await loadJobs();rerender();toast(result.notice||'Equipo guardado y verificado en Airtable.');}
    catch(error){button.disabled=false;toast(error.message,true);}
  }));
}
