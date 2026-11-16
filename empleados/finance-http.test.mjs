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
  assert.equal(table,ledger);assert.equal(options.method,'POST');
  const r={id:'rec'+String(records.length+100).padStart(14,'0'),fields:JSON.parse(options.body).fields};
  writes.push(table);records.push(r);return Response.json(r);
 };
 t.after(()=>globalThis.fetch=previous);
 async function call(user,method='GET',body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  req.url='/api/admin/finance?from=2026-11-01&to=2026-11-16';req.method=method;
  req.headers={host:'localhost',...(user?{cookie:'assa_session='+sign({user,role:user==='samuel'?'administrador':'tecnico',credential:credentialVersion(''),exp:Date.now()+60000})}:{})};
  req.socket={remoteAddress:'test'};let status,result;
  await server.listeners('request')[0](req,{setHeader(){},writeHead(s){status=s;},end(b){result=JSON.parse(String(b));}});
  return {status,result};
 }
 assert.equal((await call(null)).status,401);
 assert.equal((await call('saul')).status,403);
 assert.equal((await call('saul','POST',{})).status,403);
 const b={type:'Cobro',date:'2026-11-10',base:100,vat:21,total:121,concept:'Pago',party:'Cliente',reference:'001',evidence:'Confirmado',operationId:'a'.repeat(36)};
 assert.equal((await call('samuel','POST',b)).status,201);
 assert.equal((await call('samuel','POST',b)).status,200);
 assert.equal(writes.length,1);
 assert.equal((await call('samuel','POST',{...b,operationId:'b'.repeat(36)})).status,409);
 assert.equal((await call('samuel','POST',{...b,total:200})).status,400);
 const view=await call('samuel');assert.equal(view.status,200);assert.equal(view.result.totals.collected,100);
 assert.equal(writes.length,1);
});
