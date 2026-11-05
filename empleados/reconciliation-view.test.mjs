import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReconciliationView} from './reconciliation-view.mjs';
function sample(){
 const job={id:'recA0000000000001',fields:{'Trabajo / referencia':'Instalación A','Nombre del Cliente':'Cliente A'}};
 const client={id:'recB0000000000002',fields:{'Nombre':'Cliente A'}};
 const mainDoc={id:'recC0000000000003',fields:{
  'Clave documento':'drive:main:revision-v1','Origen':'Google Drive','Número factura':'057-26',
  'Enlace original':'https://drive.google.com/file/d/1iFV0jc0Fwou2Vxvk4HwRK_cheTHv87dQ/view',
  'Nombre original':'057-26 TSS.pdf','Cliente fiscal':'THE SAMPLING SOLUTION','Estado documental':'PDF verificado'
 }};
 const copy={id:'recD0000000000004',fields:{'Estado documental':'Copia de otra factura','Número factura':'057-26'}};
 const proposal={id:'recE0000000000005',fields:{
  'Trabajo':[job.id],'Cliente':[client.id],'Documento verificado':[mainDoc.id],
  'Número factura':'057-26','Importe factura':2190.10,'Resultado':'Propuesta para revisar',
  'Tipo revisión':'Copia duplicada','Motivos':'Dos copias físicas, una sola factura.',
  'Estado envío':'Envío verificado','Estado cobro documental':'Pago parcial en CRM'
 }};
 return {jobs:[job],clients:[client],documents:[mainDoc,copy],proposals:[proposal]};
}
test('El índice de documentos no duplica la factura por dos archivos físicos',()=>{
 const result=buildReconciliationView(sample());
 assert.equal(result.counts.proposals,1);
 assert.equal(result.counts.documentFiles,2);
 assert.equal(result.counts.duplicateFiles,1);
 assert.equal(result.counts.reviewNeeded,1);
 assert.equal(result.counts.bankVerified,0);
 assert.equal(result.access,'admin-read-only');
});
test('Los importes, nombres y enlaces a Drive usan metadatos originales',()=>{
 const r=buildReconciliationView(sample()).rows[0];
 assert.equal(r.invoice,'057-26');
 assert.equal(r.amount,2190.10);
 assert.equal(r.client,'Cliente A');
 assert.equal(r.fiscalClient,'THE SAMPLING SOLUTION');
 assert.ok(r.url.startsWith('https://drive.google.com/file/d/'));
 assert.equal(r.payment,'Pago parcial en CRM');
 assert.equal(r.result,'Propuesta para revisar');
});
test('Nunca muestra enlaces externos inventados al administrador',()=>{
 const sampleData=sample();
 sampleData.documents[0].fields['Enlace original']='https://evil.example/danger';
 sampleData.proposals[0].fields['Documento URL']='javascript:alert(1)';
 assert.equal(buildReconciliationView(sampleData).rows[0].url,'');
});
test('Una coincidencia documental no confirma el pago del cliente',()=>{
 const sampleData=sample();
 sampleData.proposals[0].fields.Resultado='Coincidencia documental';
 sampleData.proposals[0].fields['Estado cobro documental']='Cobro registrado en CRM; sin justificante contrastado';
 const r=buildReconciliationView(sampleData);
 assert.equal(r.counts.documentaryMatches,1);
 assert.equal(r.counts.bankVerified,0);
 assert.equal(r.rows[0].reviewRequired,false);
});
