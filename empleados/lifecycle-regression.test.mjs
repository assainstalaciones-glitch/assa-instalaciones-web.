import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdminDashboard} from './admin-dashboard.mjs';
import {executionSummary,reviewEvent} from './workflow.mjs';
import {OUTCOMES} from './public/outcomes.js';

const JOB_ID='rec00000000000101';
const CUSTOMER_ID='rec00000000000102';
const mockJob=fields=>({id:JOB_ID,fields:{
  'Trabajo / referencia':'Instalación demo de control (solo memoria de tests)',
  'Nombre del Cliente':'Cliente de prueba en memoria',
  'Cliente':[CUSTOMER_ID],
  'Fecha prevista':'2026-11-09',
  'Operarios asignados portal':'saul',
  ...fields
}});
const build=(fields,orders=[])=>buildAdminDashboard([mockJob(fields)],orders);
const signedOt={id:'rec00000000000103',fields:{
  'Trabajo origen':[JOB_ID],
  'Número de orden':'OT-SIMULADA-001',
  'Estado parte':'Firmado / archivado',
  'Parte firmado':[{url:'https://example.invalid/firma-simulada-no-real.pdf'}]
}};

test('Regresión segura de punta a punta: agenda → parte → revisión → factura → cobro (solo fixtures)',()=>{
  const scheduled=build({'Estado':'Aceptado / Programado'});
  assert.equal(scheduled.counts.active,1);
  assert.equal(scheduled.counts.closed,0);
  assert.equal(scheduled.counts.paymentPending,0);
  assert.equal(scheduled.rows[0].invoiceRef,'');

  const openOt={...signedOt,fields:{...signedOt.fields,'Estado parte':'Pendiente de completar','Parte firmado':[]}};
  const during=build({'Estado':'En progreso'},[openOt]);
  assert.equal(during.rows[0].needsSignature,true);
  assert.equal(during.rows[0].operationallyClosed,false);

  const reports=[{fields:{'Usuario operario':'saul','Horas reales':2.5,'Fecha trabajo':'2026-11-09',
    'Material utilizado':'Canaleta y cable','Observaciones':'Instalación terminada'}}];
  const summary=executionSummary(reports);
  assert.equal(summary.hours,2.5);
  assert.match(summary.material,/Canaleta y cable/);

  const signed=build({'Estado':'Terminado'},[signedOt]);
  assert.equal(signed.rows[0].signed,true);
  assert.equal(signed.rows[0].closed,false);
  assert.equal(signed.rows[0].noInvoiceEvidence,true);
  assert.equal(signed.rows[0].invoiceRef,''); // Una firma no fabrica factura.

  const issued=build({'Estado':'Terminado','Ref. factura':'079-26',
    'Importe total':1210,'Importe cobrado':0},[signedOt]);
  assert.equal(issued.rows[0].needsInvoice,true);
  assert.equal(issued.rows[0].needsPayment,true);
  assert.equal(issued.rows[0].closed,false);

  const sent=build({'Estado':'Pendiente de cobro','Ref. factura':'079-26',
    'Factura enviada (portal)':true,'Importe total':1210,'Importe cobrado':500},[signedOt]);
  assert.equal(sent.rows[0].needsInvoice,false);
  assert.equal(sent.rows[0].needsPayment,true);
  assert.equal(sent.rows[0].closed,false); // El pago parcial no es cobro completo.

  const fullyPaid=build({'Estado':'Pendiente de cobro','Ref. factura':'079-26',
    'Factura enviada (portal)':true,'Importe total':1210,
    'Importe cobrado':1210,'Estado cobro':'Cobrado'},[signedOt]);
  assert.equal(fullyPaid.rows[0].needsPayment,false);
  assert.equal(fullyPaid.rows[0].closed,true);
  assert.equal(fullyPaid.counts.reconciliation,0);
});

test('Cancelado, desistido y pruebas no se convierten en factura o trabajo real',()=>{
  for(const outcome of OUTCOMES.filter(x=>x.closed&&!x.signature)){
    const x=build({'Estado':outcome.status,'Resultado intervención (portal)':outcome.label});
    assert.equal(x.rows[0].closed,false, outcome.label);
    assert.equal(x.rows[0].needsPayment,false, outcome.label);
    assert.equal(x.rows[0].closedWithoutWork,true,outcome.label);
  }
  assert.equal(buildAdminDashboard([mockJob({
    'Trabajo / referencia':'PRUEBA PORTAL FIRMA — NO FACTURAR',
    'Estado':'Terminado'
  })],[]).scope.excludedTests,1);
  assert.equal(reviewEvent({fields:{'Notas internas':'OT histórica sin revisión'}}),null);
});
