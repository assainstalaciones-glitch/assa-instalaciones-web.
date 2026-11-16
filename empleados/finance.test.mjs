import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinance, validateMovement } from './finance.mjs';
const today='2026-11-16';
const fixed=[{id:'rec00000000000001',fields:{Concepto:'Alquiler','Coste mensual equivalente':300,'Incluir en punto equilibrio':true,Estado:'Confirmado'}}];
const payment=(id,date,base,extra={})=>({id,fields:{Concepto:'Pago parcial',Tipo:'Cobro','Fecha movimiento':date,'Base sin IVA':base,'IVA importe':base*.21,'Total con IVA':base*1.21,'Referencia documento':'Factura 001',Tercero:'Cliente','Evidencia':'Confirmado','Estado':'Confirmado','Operación ID':id.padEnd(36,'0'),...extra}});
const report=(movements=[],f=[],extra={})=>buildFinance(movements,f,[],{from:'2026-11-01',to:today,group:'month',today,...extra});
test('Suma solo cada cobro parcial en su fecha, no la factura entera',()=>{
 const m=[payment('a','2026-10-31',500),payment('b','2026-11-10',500)];
 assert.equal(report(m).totals.collected,500);
 assert.equal(report(m,[],{from:'2026-10-31'}).totals.collected,1000);
});
test('La fecha de confirmación del portal no se usa como fecha bancaria',()=>{
 const d=buildFinance([],[],[{id:'job',fields:{'Trabajo / referencia':'Trabajo','Importe cobrado':605,'Fecha confirmación cobro (portal)':'2026-11-10'}}],{from:'2026-11-01',to:today,today});
 assert.equal(d.totals.collected,0);assert.equal(d.warnings.length,1);
});
test('Fijos prorrateados por días y reemplazados por el real sin duplicar',()=>{
 assert.equal(report([],fixed).totals.expenses,160);
 const actual=payment('a','2026-11-03',330,{Tipo:'Gasto','Gasto fijo ID':fixed[0].id,'Periodo fijo':'2026-11'});
 assert.equal(report([actual],fixed).totals.expenses,176);
 assert.equal(report([actual],fixed).totals.estimated,0);
});
test('El redondeo conserva el total del mes al sumar días',()=>{
 const f=[{...fixed[0],fields:{...fixed[0].fields,'Coste mensual equivalente':100}}];
 const d=report([],f,{from:'2026-10-01',to:'2026-10-31',group:'day'});
 assert.equal(d.totals.expenses,100);
 assert.equal(report([],f,{from:'2026-10-01',to:'2026-10-31',group:'week'}).totals.expenses,100);
});
test('Duplicados se excluyen y avisan en vez de duplicar el ingreso',()=>{
 const d=report([payment('a','2026-11-10',100),payment('b','2026-11-10',100)]);
 assert.equal(d.totals.collected,0);assert.equal(d.warnings.length,2);
});
test('Pendientes, importes ausentes y fechas inválidas no generan cifras',()=>{
 assert.equal(report([payment('a','2026-11-10',100,{Estado:'Pendiente'})]).totals.collected,0);
 assert.equal(report([payment('a','2026-11-10',100,{'Base sin IVA':undefined})]).totals.collected,0);
 assert.throws(()=>report([],[],{from:'2026-02-30'}));
 assert.throws(()=>report([],[],{to:'2026-11-17'}));
});
test('Los gastos recibidos cuentan aunque no se haya registrado pago',()=>{
 const d=report([payment('a','2026-11-10',100,{Tipo:'Gasto'})]);
 assert.equal(d.totals.result,-100);
});
test('No se aceptan importes sin desglose ni cobros futuros',()=>{
 const base={type:'Cobro',date:'2026-11-10',base:100,vat:21,total:121,concept:'Pago',party:'Cliente',reference:'001',evidence:'Confirmado',operationId:'a'.repeat(36)};
 assert.equal(validateMovement(base,today)['Total con IVA'],121);
 assert.throws(()=>validateMovement({...base,total:200},today));
 assert.throws(()=>validateMovement({...base,date:'2026-11-20'},today));
});
