import test from 'node:test';import assert from 'node:assert/strict';
import {calendarCells,shiftMonth,overlap,dailyGaps,validTime} from './public/calendar.js';
test('Mes de 42 casillas, lunes primero, años bisiestos y cambio de año',()=>{
 const cells=calendarCells('2028-02');assert.equal(cells.length,42);assert.equal(cells[0].date,'2028-01-31');assert.ok(cells.some(c=>c.date==='2028-02-29'&&c.inMonth));
 assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.deepEqual(calendarCells('2026-13'),[]);
});
test('Horario válido, solapes y citas contiguas',()=>{
 assert.equal(validTime('24:00'),false);assert.equal(validTime('08:60'),false);assert.equal(validTime('08:30'),true);
 assert.equal(overlap({start:'09:00',end:'11:00'},{start:'10:30',end:'12:00'}),true);
 assert.equal(overlap({start:'09:00',end:'11:00'},{start:'11:00',end:'12:00'}),false);
});
test('Huecos por técnico: combina reservas solapadas e ignora trabajos cerrados',()=>{
 const jobs=[{assigned:'saul',status:'En progreso',start:'09:00',end:'11:00'},{assigned:'saul, alex',status:'Aceptado / Programado',start:'10:00',end:'12:00'},{assigned:'saul',status:'Terminado',start:'14:00',end:'18:00'}];
 assert.deepEqual(dailyGaps(jobs,'saul').gaps,[{start:'08:00',end:'09:00'},{start:'12:00',end:'18:00'}]);
 assert.deepEqual(dailyGaps(jobs,'alex').gaps,[{start:'08:00',end:'10:00'},{start:'12:00',end:'18:00'}]);
});
test('Una reserva sin hora impide presentar disponibilidad como comprobada',()=>{
 assert.equal(dailyGaps([{assigned:'saul',status:'En progreso'}],'saul').unknown,true);
 assert.equal(dailyGaps([{assigned:'saul',status:'En progreso',start:'09:00',end:''}],'saul').unknown,true);
 assert.equal(overlap({start:'09:00',end:''},{start:'09:00',end:''}),true);
 assert.equal(overlap({start:'10:00',end:''},{start:'09:00',end:'11:00'}),true);
 assert.equal(overlap({start:'09:00',end:''},{start:'11:00',end:''}),false);
});
