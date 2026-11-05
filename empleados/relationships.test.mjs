import test from 'node:test';import assert from 'node:assert/strict';import {prepareRelationships} from './relationships.mjs';import {REL_FIELDS,relationshipView} from './public/relationships.js';
const partnerId='rec00000000000001',clientId='rec00000000000002';
const findPartner=async()=>({id:partnerId,fields:{Nombre:'Colaborador de ejemplo','Papel habitual':'Intermediario','Cliente relacionado':[clientId]}});
test('Otro colaborador conserva referencia sin inventar ficha ni pagador y permite resolverlo después',async()=>{
 const fields=await prepareRelationships({partnerId:'other',partnerOther:'Encargo de mi primo',partnerRole:'Contratista'}, {},{findPartner:()=>{throw Error('No debe crear ni buscar una identidad');}});
 assert.deepEqual(fields[REL_FIELDS.partnerId],undefined);assert.equal(fields[REL_FIELDS.partnerName],'Otro · Encargo de mi primo (por confirmar)');assert.equal(fields[REL_FIELDS.partnerRole],undefined);assert.equal(fields[REL_FIELDS.invoiceTo],undefined);
 const view=relationshipView(fields,true);assert.equal(view.partnerId,'other');assert.equal(view.partnerOther,'Encargo de mi primo');
 const resolved=await prepareRelationships({partnerId,partnerRole:'Intermediario'},fields,{findPartner});assert.deepEqual(resolved[REL_FIELDS.partnerId],[partnerId]);assert.equal(resolved[REL_FIELDS.partnerName],'Colaborador de ejemplo');assert.equal(resolved[REL_FIELDS.invoiceTo],undefined);
});
test('Intermediario, inquilino y cliente fiscal son independientes; el cliente relacionado no se copia al pagador',async()=>{
 let clientReads=0;const fields=await prepareRelationships({partnerId,partnerRole:'Intermediario',occupant:'Inquilina de ejemplo',occupantRole:'Inquilino',accessPhone:'600123456'}, {},{findPartner,findClient:async()=>{clientReads++;}});
 assert.equal(fields[REL_FIELDS.partnerName],'Colaborador de ejemplo');assert.equal(fields[REL_FIELDS.occupant],'Inquilina de ejemplo');assert.equal(Object.hasOwn(fields,REL_FIELDS.invoiceTo),false);assert.equal(Object.hasOwn(fields,'Cliente'),false);assert.equal(clientReads,0);
});
test('El papel habitual se puede cambiar por encargo y el destinatario previsto debe elegirse expresamente',async()=>{
 const fields=await prepareRelationships({partnerId,partnerRole:'Contratista',invoiceTo:clientId}, {},{findPartner,findClient:async id=>{assert.equal(id,clientId);return {id};}});
 assert.equal(fields[REL_FIELDS.partnerRole],'Contratista');assert.deepEqual(fields[REL_FIELDS.invoiceTo],[clientId]);assert.equal(Object.hasOwn(fields,'Ref. factura'),false);
});
test('No se aceptan campos financieros, nombres de colaborador enviados por el cliente ni roles incoherentes',async()=>{
 for(const input of [{partnerName:'Inventado'},{'Importe cobrado':100},{partnerRole:'Contratista'},{partnerId,partnerRole:'Pagador'},{occupantRole:'Pagador'},{accessPhone:'123'}])await assert.rejects(prepareRelationships(input,{}, {findPartner,findClient:async()=>({})}));
});
test('Los técnicos reciben datos de acceso y colaborador, sin destinatario fiscal previsto',()=>{
 const fields={[REL_FIELDS.partnerId]:[partnerId],[REL_FIELDS.partnerName]:'Intermediario de ejemplo',[REL_FIELDS.accessPhone]:'600123456',[REL_FIELDS.invoiceTo]:[clientId]};
 const tech=relationshipView(fields);assert.equal(tech.partnerName,'Intermediario de ejemplo');assert.equal(tech.accessPhone,'600123456');assert.equal(Object.hasOwn(tech,'invoiceTo'),false);assert.equal(relationshipView(fields,true).invoiceTo,clientId);
});

