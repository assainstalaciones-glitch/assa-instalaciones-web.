import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createSignedWorkPdf } from './signed-pdf.mjs';

test('El parte firmado se genera como PDF legible',async()=>{
  const signature=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2sAAAAASUVORK5CYII=','base64');
  const buffer=await createSignedWorkPdf({
    number:'OT-2026-0001',
    job:{id:'rec00000000000001',reference:'PRUEBA',client:'Cliente de prueba',address:'Cambrils',description:'Instalación de prueba'},
    report:{user:'saul',date:'2026-11-04',hours:2.5,notes:'Trabajo concluido correctamente',material:'2 metros de canaleta'},
    signer:'Firma de prueba',address:'Cambrils',customerNotes:'Sin incidencias',
    signedAt:'2026-11-04T20:00:00.000Z',signature,receiptHash:'000000000000000000000000'
  });
  assert.ok(buffer.length>800);
  assert.equal(buffer.subarray(0,4).toString(),'%PDF');
  const pdf=await PDFDocument.load(buffer);
  assert.ok(pdf.getPageCount()>=1);
  assert.equal(pdf.getTitle(),'Parte de trabajo firmado - ASSA Instalaciones');
});
