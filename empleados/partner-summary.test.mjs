import test from 'node:test';import assert from 'node:assert/strict';import {partnerSummary} from './partner-summary.mjs';import {INSTALLATION_FIELDS as I,INSTALLATION_MODE,fifteenDayRange} from './public/partner-installations.js';import {REL_FIELDS as R} from './public/relationships.js';import {AUDIT_FIELD} from './direction-edit.mjs';
const partner='rec00000000000010';
const job=(id,extra={})=>({id,fields:{[I.mode]:INSTALLATION_MODE,[I.units]:1,[R.partnerId]:[partner],[R.partnerName]:'Colaborador de ejemplo','Fecha prevista':'2026-11-06',Dirección:'Obra de ejemplo',Estado:'Terminado',[I.executedOn]:'2026-11-06',[AUDIT_FIELD]:JSON.stringify([{kind:'outcome',code:'completed',state:'approved',reviewedBy:'samuel'}]),...extra}});
test('El recuento usa ejecución real y aprobación, no fecha prevista ni datos del cliente final',()=>{
 const data=partnerSummary([job('1',{[I.units]:2}),job('2',{'Fecha prevista':'2026-11-06',[I.executedOn]:'2026-11-16'}),job('3',{Estado:'Aceptado / Programado',[I.executedOn]:null,[AUDIT_FIELD]:null}),job('4',{Estado:'Cancelado'})],[],{from:'2026-11-01',to:'2026-11-15',partnerId:partner});
 assert.equal(data.counts.completedJobs,1);assert.equal(data.counts.completedUnits,2);assert.equal(data.counts.toPrepareUnits,2);assert.equal(data.counts.plannedJobs,1);assert.equal(data.counts.notDoneJobs,1);assert.equal(data.rows.some(r=>r.id==='2'),false);
});
test('Sin fecha real o sin revisión no se suman instalaciones para preparar factura; referencias existentes se separan',()=>{
 const data=partnerSummary([job('1',{[I.executedOn]:null}),job('2',{[AUDIT_FIELD]:null}),job('3',{'Ref. factura':'FACTURA-EXISTENTE'}),job('4',{[I.mode]:null})],[],{from:'2026-11-01',to:'2026-11-15'});
 assert.equal(data.counts.undatedJobs,1);assert.equal(data.counts.reviewJobs,1);assert.equal(data.counts.completedUnits,1);assert.equal(data.counts.toPrepareUnits,0);assert.equal(data.counts.withInvoiceUnits,1);assert.equal(data.rows.some(r=>r.id==='4'),false);
});
test('Periodos de 15 días inclusivos cruzan mes y año; fechas inválidas se rechazan',()=>{
 assert.deepEqual(fifteenDayRange('2027-01-05'),{from:'2026-12-22',to:'2027-01-05'});assert.throws(()=>partnerSummary([],[],{from:'2026-11-20',to:'2026-11-01'}));
});
