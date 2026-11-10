import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';

test('Restablecimiento completo con Airtable simulado: permisos, un solo uso y sesiones revocadas',async t=>{
 process.env.AIRTABLE_TOKEN='pat-reset-fixture';
 process.env.SESSION_SECRET='reset-fixture-'.repeat(4);
 process.env.BOOTSTRAP_USER='samuel';
 process.env.BOOTSTRAP_PASSWORD_HASH='scrypt$fixture$'+'0'.repeat(128);
 const {server,sign,passwordHash,comparePassword,credentialVersion}=await import('./server.mjs');
 const id='rec11111111111111',oldPassword='anterior-segura-2026',newPassword='nueva-segura-2026';
 const row={id,fields:{Usuario:'saul',Nombre:'Técnico simulado',Rol:'tecnico',Activo:true,'Hash contraseña':passwordHash(oldPassword)}};
 const original={...row.fields},writes=[];
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(input,opts={})=>{
  const url=new URL(input);assert.equal(url.hostname,'api.airtable.com');assert.ok(url.pathname.includes('/tblZURy4PjvmL1Kr0'));
  if(opts.method==='PATCH'){const body=JSON.parse(opts.body);assert.deepEqual(Object.keys(body.fields),['Hash contraseña']);writes.push(body.fields);Object.assign(row.fields,body.fields);}
  return Response.json(url.pathname.endsWith('/'+id)?row:{records:[row]});
 };
 t.after(()=>{globalThis.fetch=realFetch;});
 const session=()=>sign({user:'saul',role:'tecnico',credential:credentialVersion(row.fields['Hash contraseña']),exp:Date.now()+60000});
 const oldSession=session(),admin=sign({user:'samuel',role:'administrador',exp:Date.now()+60000});
 let requestNo=0;
 const call=async(path,cookie='',data,origin)=>{
  const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);
  req.url='/api'+path;req.method=data?'POST':'GET';req.headers={host:'localhost',cookie:cookie?'assa_session='+cookie:'',...(origin?{origin}:{})};req.socket={remoteAddress:'fixture'+(++requestNo)};
  let status,result,setCookie;
  const res={setHeader(k,v){if(k==='Set-Cookie')setCookie=v;},writeHead(c){status=c;},end(b){result=JSON.parse(String(b));}};
  await server.listeners('request')[0](req,res);return {status,data:result,cookie:setCookie};
 };
 const endpoint='/employees/'+id+'/password-reset';
 assert.equal((await call(endpoint,'',{})).status,401);
 assert.equal((await call(endpoint,oldSession,{})).status,403);
 assert.equal((await call(endpoint,admin,{},'https://evil.invalid')).status,403);
 row.fields.Activo=false;assert.equal((await call(endpoint,admin,{})).status,400);row.fields.Activo=true;
 const issued=await call(endpoint,admin,{});assert.equal(issued.status,200);assert.equal(writes.length,0);
 const token=issued.data.token,claim=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
 assert.ok(claim.exp>Date.now()&&claim.exp<=Date.now()+15*60000);
 assert.equal((await call('/me',token)).status,401);
 assert.equal((await call('/password-reset','',{token:token+'x',password:newPassword})).status,400);
 assert.equal((await call('/password-reset','',{token:sign({...claim,exp:Date.now()-1}),password:newPassword})).status,400);
 assert.equal((await call('/password-reset','',{token,password:'corta'})).status,400);
 assert.equal((await call('/password-reset','',{token,password:oldPassword})).status,400);
 assert.equal(writes.length,0);
 row.fields.Activo=false;assert.equal((await call('/password-reset','',{token,password:newPassword})).status,400);row.fields.Activo=true;
 const changed=await call('/password-reset','',{token,password:newPassword});assert.equal(changed.status,200);
 assert.equal(writes.length,1);assert.ok(comparePassword(newPassword,row.fields['Hash contraseña']));assert.ok(!comparePassword(oldPassword,row.fields['Hash contraseña']));
 for(const key of ['Usuario','Nombre','Rol','Activo'])assert.equal(row.fields[key],original[key]);
 assert.equal((await call('/password-reset','',{token,password:'tercera-segura-2026'})).status,400);
 assert.equal((await call('/me',oldSession)).status,401);
 assert.equal((await call('/login','',{username:'saul',password:oldPassword})).status,401);
 const login=await call('/login','',{username:'saul',password:newPassword});assert.equal(login.status,200);
 assert.equal((await call('/me',login.cookie.split(';')[0].slice('assa_session='.length))).status,200);
 assert.equal(writes.length,1);
});

test('Enlace no depende de almacenamiento efímero y dos envíos simultáneos no cambian dos veces',async t=>{
 // Same module and fixture configuration; no production requests permitted.
 const {server,sign,passwordHash,credentialVersion,resetPassword}=await import('./server.mjs');
 const row={id:'rec22222222222222',fields:{Usuario:'alex',Rol:'tecnico',Activo:true,'Hash contraseña':passwordHash('anterior-segura-2026')}};
 const token=sign({purpose:'password-reset',record:row.id,user:'alex',role:'tecnico',credential:credentialVersion(row.fields['Hash contraseña']),exp:Date.now()+60000});
 const realFetch=globalThis.fetch;let writes=0;
 globalThis.fetch=async(input,opts={})=>{
  assert.equal(new URL(input).hostname,'api.airtable.com');
  await new Promise(resolve=>setTimeout(resolve,5));
  if(opts.method==='PATCH'){writes++;Object.assign(row.fields,JSON.parse(opts.body).fields);}
  return Response.json(row);
 };
 t.after(()=>{globalThis.fetch=realFetch;});
 const results=await Promise.allSettled([resetPassword({token,password:'primera-segura-2026'}),resetPassword({token,password:'segunda-segura-2026'})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(writes,1);
});
