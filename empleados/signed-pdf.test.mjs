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


test('La OT se puede mostrar al cliente sin firma antes de cerrar el trabajo',async()=>{
  const buffer=await createSignedWorkPdf({
    number:'BORRADOR - SIN FIRMAR',
    job:{id:'rec00000000000001',reference:'PRUEBA OT',client:'Cliente de prueba',address:'Cambrils',description:'Cambio de equipo de climatización'},
    report:{user:'cesar',date:'2026-11-04',hours:3,notes:'Equipo instalado y probado',material:'2 metros de canaleta\n8 codos\n3 metros de cableado'},
    signer:'',address:'Cambrils',customerNotes:'',
    signedAt:'2026-11-04T20:00:00.000Z',signature:null,receiptHash:''
  });
  const pdf=await PDFDocument.load(buffer);
  assert.equal(pdf.getTitle(),'Orden de trabajo - ASSA Instalaciones');
  assert.ok(pdf.getPageCount()>=1);
  assert.equal(buffer.subarray(0,4).toString(),'%PDF');
});


test('La OT corporativa admite datos completos de Airtable y muchas partidas sin cortar el documento',async()=>{
  const materials=Array.from({length:35},(_,i)=>String(i+1)+' metros de tuberia y accesorios de instalacion para prueba de maquetacion').join('\n');
  const buf=await createSignedWorkPdf({
    number:'OT-2026-0999',job:{
      id:'rec00000000000001',reference:'PRUEBA DE OT',client:'CLIENTE FICTICIO',
      address:'Carrer de prova 120, local segundo, puerta izquierda, Cambrils',
      city:'Cambrils',postal:'43850',phone:'600 000 000',email:'prueba@example.org',taxId:'00000000T',
      budget:'PRES-2026-0022',date:'2026-11-04',
      description:'Cambio de termo eléctrico de 50 litros con desmontaje del anterior y verificacion del funcionamiento.'
    },
    report:{user:'saul',date:'2026-11-04',hours:4,notes:'Instalación finalizada. Se realizan pruebas de estanqueidad y funcionamiento, con resultado satisfactorio.',material:materials},
    signer:'',customerNotes:'',signedAt:'2026-11-04T20:00:00.000Z',signature:null,receiptHash:''
  });
  assert.equal(buf.subarray(0,4).toString(),'%PDF');
  const doc=await PDFDocument.load(buf);
  assert.ok(doc.getPageCount()>=2);
});
