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
test('Los cobros del CRM aparecen como cobrados pero no se asignan a un mes sin fecha bancaria',()=>{
 const d=buildFinance([],[],[{id:'job',fields:{'Trabajo / referencia':'Trabajo','Importe cobrado':605,'Fecha confirmación cobro (portal)':'2026-11-10'}}],{from:'2026-11-01',to:today,today});
 assert.equal(d.totals.collected,0);
 assert.equal(d.crm.totals.paid,605);
 assert.equal(d.crm.missingPaymentDates,1);
 assert.equal(d.crm.pending.length,0);
 assert.equal(d.warnings.length,0);
});
test('Cobros completos, parciales y deudas facturadas aparecen por separado sin duplicarse',()=>{
 const jobs=[
  {id:'full',fields:{'Trabajo / referencia':'Pagado','Importe total':242,'Importe cobrado':242,'Ref. factura':'058-26','Estado':'Terminado','Estado cobro':'Cobrado'}},
  {id:'partial',fields:{'Trabajo / referencia':'Termo','Importe total':568.70,'Importe cobrado':284.35,'Ref. factura':'079-26','Estado':'Terminado','Estado cobro':'Parcial'}},
  {id:'pending',fields:{'Trabajo / referencia':'Caldera','Importe total':1490,'Importe cobrado':0,'Ref. factura':'075-26','Estado':'Pendiente de cobro','Estado cobro':'Pendiente'}},
  {id:'partial2',fields:{'Trabajo / referencia':'TSS','Importe total':2190.10,'Importe cobrado':834.90,'Ref. factura':'057-26','Estado':'Pendiente de cobro'}},
  {id:'budget',fields:{'Trabajo / referencia':'Presupuesto sin aceptar','Importe total':4000,'Ref. factura':'','Estado':'Presupuesto enviado','Estado cobro':'Pendiente'}},
  {id:'cancel',fields:{'Trabajo / referencia':'Cancelado','Importe total':3000,'Ref. factura':'100-26','Estado':'Cancelado','Estado cobro':'Pendiente'}},
  {id:'old',fields:{'Trabajo / referencia':'Archivo antiguo','Importe total':1700,'Ref. factura':'011-21'}},
 ];
 const d=buildFinance([],[],jobs,{from:'2026-11-01',to:today,today});
 assert.equal(d.crm.paid.length,3);
 assert.equal(d.crm.pending.length,3);
 assert.equal(d.crm.totals.paid,1361.25);
 assert.equal(d.crm.totals.pending,3129.55);
 assert.equal(d.totals.collected,0);
 assert.deepEqual(d.crm.pending.map(x=>x.concept).sort(),['Caldera','TSS','Termo']);
 assert.equal(d.warnings.length,0);
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
