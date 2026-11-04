import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommercialOT } from './ot-commercial.mjs';

test('La OT imprime un solo concepto sin desglose de material y precio confirmado por la orden',()=>{
 const x=buildCommercialOT({
  workName:'Merche - Caldera Warmhaus',description:'Suministro e instalación caldera Warmhaus Enerwa 24/31',
  orderBase:1370,orderVat:.21,orderTotal:1657.70
 });
 assert.equal(x.item,'Caldera Warmhaus Enerwa 24/31');
 assert.equal(x.base,1370);
 assert.equal(x.vatAmount,287.70);
 assert.equal(x.total,1657.70);
 assert.equal(x.priceVerified,true);
});
test('Acepta presupuesto confirmado solo cuando base y total de Airtable cuadran',()=>{
 const x=buildCommercialOT({
  workName:'Pura - ORKLI',description:'Presupuesto ASSA-2026-0027 aceptado (95 € + IVA)',
  jobBudget:'ASSA-2026-0027',jobTotal:114.95,status:'Aceptado / Programado'
 });
 assert.equal(x.base,95);
 assert.equal(x.vatRate,.21);
 assert.equal(x.total,114.95);
 assert.equal(x.priceVerified,true);
});
test('No confunde el precio neto ambiguo ni los costes con total acordado',()=>{
 const x=buildCommercialOT({
  workName:'Trabajo pendiente',description:'Equipo 1.600 € + IVA, coste interno 600 €',
  jobBudget:'149',jobTotal:1600,status:'Aceptado / Programado'
 });
 assert.equal(x.priceVerified,false);
 assert.equal(x.base,null);
 assert.equal(x.total,null);
});
test('Concepto Mitsubishi resumido sin precios ni lista de cables',()=>{
 const x=buildCommercialOT({description:'Instalación Mitsubishi Electric MSZ-HR35VFK WiFi y cableado. Coste material 500 €',
   workName:'Dolores - aire acondicionado'});
 assert.equal(x.item,'Aire acondicionado Mitsubishi Electric MSZ-HR35VFK');
 assert.equal(x.priceVerified,false);
});
