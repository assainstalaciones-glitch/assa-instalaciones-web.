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
 // Un trabajo de antes del portal sin OT vinculada no se anuncia como firma pendiente.
 assert.equal(data.counts.unsigned,0);
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


test('Trabajo cobrado con factura existente no se presenta como envío o pago pendiente',()=>{
 const r=buildAdminDashboard([
  job('rec00000000000005',{'Trabajo / referencia':'Instalación Mitsubishi',
    'Cliente':['rec00000000000015'],'Estado':'Terminado','Ref. factura':'074-26',
    'Importe total':1399,'Importe cobrado':1399,'Estado cobro':'Cobrado'})
 ],[]).rows[0];
 assert.equal(r.needsInvoice,false);
 assert.equal(r.needsPayment,false);
 assert.equal(r.needsReview,false);
 assert.equal(r.needsSignature,false);
 assert.equal(r.invoiceSent,false); // No inventar comprobante de envío.
 assert.equal(r.dataIncomplete,false);
});
test('Trabajos pagados según el seguimiento quedan por conciliar, no por reclamar',()=>{
 const r=buildAdminDashboard([
  job('rec00000000000006',{'Trabajo / referencia':'Revisión hotel',
    'Cliente':['rec00000000000017'],'Estado':'Terminado',
    'Descripción del trabajo':'Revisión terminada y pagada. Faltan los datos de la factura.'})
 ],[]).rows[0];
 assert.equal(r.paidReported,true);
 assert.equal(r.needsPayment,false);
 assert.equal(r.needsInvoice,false);
 assert.equal(r.dataIncomplete,true);
 assert.deepEqual(r.missingData,['Referencia de factura sin vincular']);
});
test('Visita expresamente gratuita no genera alerta de factura no localizada',()=>{
 const r=buildAdminDashboard([
  job('rec00000000000007',{'Trabajo / referencia':'Reparación sin cobro',
    'Cliente':['rec00000000000017'],'Estado':'Terminado',
    'Descripción del trabajo':'NO COBRÓ NADA. NO FACTURAR COMO INGRESO.'})
 ],[]).rows[0];
 assert.equal(r.nonBillable,true);
 assert.equal(r.noInvoiceEvidence,false);
 assert.equal(r.needsReview,false);
});
test('OT anterior sin firma se identifica sin abrir un falso cobro pendiente',()=>{
 const r=buildAdminDashboard([
  job('rec00000000000008',{'Trabajo / referencia':'Instalación pagada',
    'Cliente':['rec00000000000017'],'Estado':'Terminado',
    'Ref. factura':'073-26','Importe total':871.2,'Importe cobrado':871.2})
 ],[order('rec00000000000009','rec00000000000008',
  {'Estado parte':'Pendiente de completar','Número de orden':'OT-2026-0009'})]).rows[0];
 assert.equal(r.needsSignature,true);
 assert.equal(r.needsPayment,false);
 assert.equal(r.needsReview,false);
});
test('Una factura enviada con referencia no enlazada es documentación, no nuevo envío',()=>{
 const r=buildAdminDashboard([
  job('rec00000000000010',{'Trabajo / referencia':'Caldera',
    'Cliente':['rec00000000000017'],'Estado':'Terminado','Factura enviada (portal)':true})
 ],[]).rows[0];
 assert.equal(r.needsInvoice,false);
 assert.equal(r.dataIncomplete,true);
 assert.equal(r.noInvoiceEvidence,false);
});
