import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
test('Finanzas: autorización, reintentos y escrituras limitadas al auxiliar',async t=>{
 process.env.AIRTABLE_TOKEN='pat-test-only';process.env.SESSION_SECRET='x'.repeat(40);
 process.env.BOOTSTRAP_USER='samuel';process.env.BOOTSTRAP_PASSWORD_HASH='scrypt$test$'+'0'.repeat(128);
 const {server,sign,credentialVersion}=await import('./server.mjs');
 const ledger='tbl5jKkC9sM6BkRvX',tables={
  [ledger]:[],tblDQafasXbGd9ijP:[],tblsVLKBSafEEiUlI:[],
  tblZURy4PjvmL1Kr0:[{id:'rec00000000000001',fields:{Usuario:'saul',Rol:'tecnico',Activo:true}}]
 };
 const writes=[],previous=globalThis.fetch;
 globalThis.fetch=async(input,options={})=>{
  const u=new URL(input);assert.equal(u.hostname,'api.airtable.com');
  const [,v,base,table,id]=u.pathname.split('/');assert.equal(base,'appdHOIMfkGPduA83');
  const records=tables[table];assert.ok(records);
  if((options.method||'GET')==='GET')return Response.json(id?records.find(r=>r.id===id):{records});
  if(options.method==='PATCH'){
   assert.equal(table,'tblsVLKBSafEEiUlI');
   const rec=records.find(r=>r.id===id);assert.ok(rec);
   const body=JSON.parse(options.body);Object.assign(rec.fields,body.fields);
   writes.push('jobs:'+id);return Response.json(rec);
  }
  assert.equal(table,ledger);assert.equal(options.method,'POST');
  const r={id:'rec'+String(records.length+100).padStart(14,'0'),fields:JSON.parse(options.body).fields};
  writes.push(table);records.push(r);return Response.json(r);
 };
 t.after(()=>globalThis.fetch=previous);
 async function call(user,method='GET',body,path='/api/admin/finance?from=2026-11-01&to=2026-11-16'){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  req.url=path;req.method=method;
  req.headers={host:'localhost',...(user?{cookie:'assa_session='+sign({user,role:user==='samuel'?'administrador':'tecnico',credential:credentialVersion(''),exp:Date.now()+60000})}:{})};
  req.socket={remoteAddress:'test'};let status,result;
  await server.listeners('request')[0](req,{setHeader(){},writeHead(s){status=s;},end(b){result=JSON.parse(String(b));}});
  return {status,result};
 }
 assert.equal((await call(null)).status,401);
 assert.equal((await call('saul')).status,403);
 assert.equal((await call('saul','POST',{})).status,403);
 const b={type:'Cobro',date:'2026-11-10',base:100,vat:21,total:121,concept:'Pago',party:'Cliente',reference:'001',evidence:'Confirmado',operationId:'a'.repeat(36),confirmed:true};
 assert.equal((await call('samuel','POST',{...b,confirmed:false})).status,400);
 assert.equal((await call('samuel','POST',b)).status,201);
 assert.equal((await call('samuel','POST',b)).status,200);
 assert.equal(writes.length,1);
 assert.equal((await call('samuel','POST',{...b,operationId:'b'.repeat(36)})).status,409);
 assert.equal((await call('samuel','POST',{...b,total:200})).status,400);
 const view=await call('samuel');assert.equal(view.status,200);assert.equal(view.result.totals.collected,100);
 assert.equal(writes.length,1);
 const jobId='rec00000000000099';
 tables.tblsVLKBSafEEiUlI.push({id:jobId,fields:{'Trabajo / referencia':'Cliente pagado','Importe total':60.5,'Importe cobrado':60.5}});
 const excessive={...b,reference:'otra-factura',jobId,operationId:'c'.repeat(36)};
 assert.equal((await call('samuel','POST',excessive)).status,409);
 assert.equal(writes.length,1);
 const costsPath='/api/admin/finance/job-costs';
 const costInput={jobId,material:100,other:0,hours:6,hourRate:20,saleNet:1500,
  evidence:'Albarán Saltoki 1626935, parte operario firmado y factura del trabajo',
  expectedRevision:'',confirmed:true,operationId:'d'.repeat(36)};
 assert.equal((await call('saul','POST',costInput,costsPath)).status,403);
 assert.equal((await call('samuel','POST',{...costInput,evidence:'x'},costsPath)).status,400);
 const write=await call('samuel','POST',costInput,costsPath);
 assert.equal(write.status,200);
 assert.equal(writes.length,2);
 const job=tables.tblsVLKBSafEEiUlI.find(x=>x.id===jobId);
 assert.equal(job.fields['Coste material / equipos'],100);
 assert.equal(job.fields['Otros costes directos'],0);
 assert.equal(job.fields['Horas reales verificadas (operario-h)'],6);
 assert.equal(job.fields['Coste de mano de obra imputado'],120);
 assert.equal(job.fields['Venta neta sin IVA'],1500);
 assert.equal(job.fields['Estado económico validado'],'Parcial orientativo');
 assert.match(job.fields['Evidencia y pendientes económicos'],/Saltoki 1626935/);
 assert.equal((await call('samuel','POST',costInput,costsPath)).result.unchanged,true);
 assert.equal(writes.length,2);
 assert.equal((await call('samuel','POST',{...costInput,operationId:'e'.repeat(36),material:200},costsPath)).status,409);
 assert.equal(writes.length,2);
});
