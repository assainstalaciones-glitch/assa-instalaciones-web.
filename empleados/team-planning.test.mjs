import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSA_TEAMS, DAILY_CAPACITY_MINUTES, mondayISO, addDaysISO, buildTeamWeek } from './public/team-planning.js';

const job=(id,extra={})=>({id,reference:'Instalación '+id,status:'Aceptado / Programado',date:'2026-11-18',start:'09:00',end:'12:00',team:ASSA_TEAMS[0].id,...extra});
test('calendario semanal estable de lunes a viernes, sin depender de zona horaria local',()=>{
  assert.equal(mondayISO('2026-11-18'),'2026-11-16');
  assert.equal(addDaysISO('2026-11-16',4),'2026-11-20');
  assert.equal(DAILY_CAPACITY_MINUTES,510);
});
test('horas ocupadas son del equipo, no se duplican por sus dos operarios',()=>{
  const data=buildTeamWeek([job('uno')],'2026-11-16','2026-11-17');
  const team=data.days[2].teams[0];
  assert.equal(team.jobs.length,1);assert.equal(team.busyMinutes,180);
  assert.equal(team.freeMinutes,330);assert.equal(team.conflicts.length,0);
});
test('solapes se detectan y el tiempo de ocupación no se suma dos veces',()=>{
  const data=buildTeamWeek([job('uno'),job('dos',{start:'10:00',end:'13:00'})],'2026-11-16','2026-11-17');
  const team=data.days[2].teams[0];
  assert.equal(team.conflicts.length,1);assert.equal(team.busyMinutes,240);
  assert.equal(team.freeMinutes,270);assert.equal(data.conflictCount,1);
});
test('pausa de comida y exceso de jornada no se cuentan como disponibilidad',()=>{
  const data=buildTeamWeek([job('uno',{start:'13:00',end:'19:00'})],'2026-11-16','2026-11-17');
  const team=data.days[2].teams[0];
  assert.equal(team.busyMinutes,240); // 13–14 y 15–18
  assert.equal(team.freeMinutes,270);
  assert.equal(team.outsideHours.length,1);
});
test('trabajos sin equipo y sin duración no se presentan como ocupación confirmada',()=>{
  const data=buildTeamWeek([
    job('uno',{team:''}),
    job('dos',{team:ASSA_TEAMS[1].id,end:''}),
    job('tres',{status:'Terminado'}),
    job('cuatro',{date:'2026-11-12',team:''}),
    job('cinco',{date:''})
  ],'2026-11-16','2026-11-17');
  assert.equal(data.unassignedCount,1);
  assert.equal(data.days[2].teams[1].unknown.length,1);
  assert.equal(data.uncertaintyCount,1);
  assert.equal(data.overdue.length,1);
  assert.equal(data.undated.length,1);
});
test('trabajos de prueba y cancelados no contaminan la capacidad',()=>{
  const data=buildTeamWeek([
    job('uno',{reference:'PRUEBA PORTAL'}),
    job('dos',{status:'Cancelado'})
  ],'2026-11-16','2026-11-17');
  assert.equal(data.days[2].teams[0].jobs.length,0);
  assert.equal(data.days[2].teams[0].freeMinutes,510);
});
