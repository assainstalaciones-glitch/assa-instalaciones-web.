import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminDashboard, isTestRecord } from './admin-dashboard.mjs';

const job=(id,fields)=>({id,fields:{'Nombre del Cliente':'Cliente real',...fields}});
const order=(id,work,fields)=>({id,fields:{'Trabajo origen':[work],...fields}});
test('Se excluyen pruebas de producción y facturas históricas sin estado operativo',()=>{
 const jobs=[
  job('rec00000000000001',{'Trabajo / referencia':'PRUEBA 2 — NO FACTURAR','Estado':'Terminado'}),
  job('rec00000000000002',{'Trabajo / referencia':'Factura 2024-123'}),
  job('rec00000000000003',{'Trabajo / referencia':'Instalación caldera','Estado':'Aceptado / Programado'})
 ];
 const data=buildAdminDashboard(jobs,[]);
 assert.equal(data.scope.excludedTests,1);
 assert.equal(data.scope.unclassified,1);
 assert.equal(data.scope.operational,1);
 assert.equal(data.counts.active,1);
 assert.equal(data.counts.unsigned,1);
 assert.equal(data.counts.missingInvoice,0);
});
test('OT firmada, factura registrada pero envío pendiente de confirmación y cobro parcial',()=>{
 const jobs=[job('rec00000000000001',{'Trabajo / referencia':'Caldera cliente','Estado':'Terminado',
  'Ref. factura':'072-26','Importe total':1210,'Importe cobrado':500,'Estado cobro':'Parcial'})];
 const orders=[order('rec00000000000004','rec00000000000001',{'Estado parte':'Firmado / archivado',
  'Parte firmado':[{url:'https://example.com/signed.pdf'}],'Número de orden':'OT-2026-0009'})];
 const data=buildAdminDashboard(jobs,orders),r=data.rows[0];
 assert.equal(data.counts.unsigned,0);
 assert.equal(data.counts.missingInvoice,0);
 assert.equal(data.counts.invoiceUnconfirmed,1);
 assert.equal(data.counts.paymentPending,1);
 assert.equal(r.signed,true);
 assert.equal(r.invoiceSent,false);
 assert.equal(r.invoiceRef,'072-26');
});
test('Confirmación manual de cobro sin conciliación queda marcada para revisar, no altera importes',()=>{
 const data=buildAdminDashboard([
  job('rec00000000000003',{'Trabajo / referencia':'Instalación','Estado':'Pendiente de cobro',
   'Factura enviada (portal)':true,'Cobro confirmado (portal)':true,'Importe total':605,'Importe cobrado':0,'Estado cobro':'Pendiente'})
 ],[]);
 assert.equal(data.counts.paymentPending,0);
 assert.equal(data.counts.reconciliation,1);
 assert.equal(data.rows[0].paid,0);
 assert.ok(data.rows[0].anomalies.some(x=>x.includes('conciliar')));
});
test('La referencia con prueba de estanqueidad real no se confunde con una simulación',()=>{
 assert.equal(isTestRecord({'Trabajo / referencia':'Prueba de estanqueidad gas a cliente real'}),false);
 assert.equal(isTestRecord({'Trabajo / referencia':'PRUEBA PORTAL FIRMA CLIENTE — NO FACTURAR'}),true);
});
