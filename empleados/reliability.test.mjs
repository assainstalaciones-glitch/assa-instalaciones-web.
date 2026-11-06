import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {writeKeys} from './reliability.mjs';
import {draftKey,freshDraft,dailyReport,operationalJob} from './public/recovery.js';
import {executionSummary} from './workflow.mjs';
import {economicsView} from './economics.mjs';

test('Costes de solo lectura: vacíos no son cero y margen oculto hasta validación completa',()=>{
 const data={'Margen analítico tras mano de obra':800,'Portal · Horas cerradas automáticas':4};
 const view=economicsView(data);assert.equal(view.margin,null);assert.equal(view.provisionalLabour,null);assert.equal(view.declaredHours,4);
 assert.equal(economicsView({...data,'Estado económico validado':'Completo documentado'}).margin,800);
 assert.equal(data['Estado económico validado'],undefined);
});

test('Aislamiento de borradores, caducidad y exclusión de pruebas sin ocultar trabajos reales',()=>{
 assert.notEqual(draftKey('saul','report','x','2026-11-06'),draftKey('alex','report','x','2026-11-06'));
 assert.notEqual(draftKey('saul','report','x','2026-11-06'),draftKey('saul','report','x','2026-11-07'));
 assert.equal(freshDraft({updatedAt:0},86400001),null);
 assert.ok(freshDraft({updatedAt:100},101));
 assert.equal(operationalJob({client:'CLIENTE FICTICIO — PRUEBA INTERNA ASSA'}),false);
 assert.equal(operationalJob({reference:'Revisión de prueba de estanqueidad'}),true);
 assert.equal(dailyReport([{user:'saul',date:'2026-11-05',hours:2},{user:'saul',date:'2026-11-06',hours:3}],'saul','2026-11-06').hours,3);
 const a=writeKeys('/api/jobs/rec00000000000001/reports','POST'),b=writeKeys('/api/jobs/rec00000000000002/reports','POST');
 assert.ok(!a.some(k=>b.includes(k)));
 assert.ok(writeKeys('/api/jobs/rec00000000000001/schedule','PATCH').includes('planning'));
});

test('Jornadas, reintentos, fotos y concurrencia con Airtable exclusivamente simulado',async t=>{
 process.env.AIRTABLE_TOKEN='pat-local-fixture';process.env.SESSION_SECRET='fixture-'.repeat(7);process.env.BOOTSTRAP_USER='samuel';process.env.BOOTSTRAP_PASSWORD_HASH='scrypt$test$'+'0'.repeat(128);
 const {server,sign}=await import('./server.mjs');
 const jid='rec11111111111111',other='rec22222222222222';
 const jobs=[jid,other].map(id=>({id,fields:{Estado:'En progreso','Operarios asignados portal':'saul, alex'}}));
 const tables={tblsVLKBSafEEiUlI:jobs,tblprtqasdBxVVsNx:[],tblqkKyk1HvE3rFKw:[],tblvZgkNh2cX1bTNx:[],tblZURy4PjvmL1Kr0:['saul','alex'].map((name,i)=>({id:'rec'+String(i+5).padStart(14,'0'),fields:{Usuario:name,Rol:'tecnico',Activo:true}}))};
 let sequence=1000,uploads=0,hold=null;
 const oldFetch=globalThis.fetch;t.after(()=>globalThis.fetch=oldFetch);
 globalThis.fetch=async(input,options={})=>{
   const url=new URL(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
   assert.ok(['api.airtable.com','content.airtable.com'].includes(url.hostname),'No external service in tests');
   if(url.hostname==='content.airtable.com'){
     uploads++;const record=Object.values(tables).flat().find(r=>r.id===url.pathname.split('/')[3]);
     (record.fields.Fotos||=[]).push({id:'att'+uploads,filename:body.filename,url:'https://example.invalid/photo.jpg'});return Response.json({});
   }
   const [,v,base,table,id]=url.pathname.split('/'),records=tables[table]||=[];
   if(method==='GET')return Response.json(id?records.find(r=>r.id===id):{records});
   if(hold&&id===hold.id&&method==='PATCH'){hold.enter();await hold.wait;}
   if(method==='PATCH'){const r=records.find(r=>r.id===id);Object.assign(r.fields,body.fields);return Response.json(r);}
   const r={id:'rec'+String(sequence++).padStart(14,'0'),fields:body.fields};records.push(r);return Response.json(r);
 };
 const call=async(path,user='saul',method='GET',data)=>{
   const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);req.url='/api'+path;req.method=method;
   req.headers={host:'localhost',cookie:'assa_session='+sign({user,role:'tecnico',exp:Date.now()+60000})};req.socket={remoteAddress:'fixture'};
   let status,result;await server.listeners('request')[0](req,{setHeader(){},writeHead(code){status=code;},end(body){result=JSON.parse(String(body));}});return {status,data:result};
 };
 const body=(date,hours)=>({date,hours,notes:'Trabajo documentado',material:'Canaleta',expected:'new'});
 assert.equal(Object.hasOwn((await call('/jobs/'+jid)).data.job,'economics'),false);
 let first;
 await t.test('Dos operarios durante dos días conservan cuatro registros y suman horas-persona',async()=>{
   for(const user of ['saul','alex'])for(const date of ['2026-11-05','2026-11-06']){const r=await call('/jobs/'+jid+'/reports',user,'POST',body(date,2));assert.equal(r.status,200,JSON.stringify(r.data));if(!first)first=r.data.report;}
   assert.equal(tables.tblprtqasdBxVVsNx.length,4);
   const sum=executionSummary(tables.tblprtqasdBxVVsNx);assert.equal(sum.hours,8);assert.equal(sum.user,'saul, alex');assert.match(sum.notes,/2026-11-05/);assert.match(sum.notes,/2026-11-06/);
 });
 await t.test('Reintento tras respuesta perdida no duplica jornada; edición obsoleta no pisa datos',async()=>{
   const again=await call('/jobs/'+jid+'/reports','saul','POST',body('2026-11-05',2));assert.equal(again.status,200);assert.equal(tables.tblprtqasdBxVVsNx.length,4);
   const edit={...body('2026-11-05',3),expected:first.version,reportId:first.id};assert.equal((await call('/jobs/'+jid+'/reports','saul','POST',edit)).status,200);
   assert.equal((await call('/jobs/'+jid+'/reports','saul','POST',{...edit,hours:9})).status,409);
   assert.equal(tables.tblprtqasdBxVVsNx[0].fields['Horas reales'],3);
 });
 await t.test('Visita con ID estable se recupera después de crear sin duplicar ni crear un trabajo',async()=>{
   const b={operationId:'11111111-2222-4333-8444-555555555555',title:'Diagnóstico',address:'Cambrils',notes:'Notas originales'};
   const one=await call('/visits','saul','POST',b),two=await call('/visits','saul','POST',b);
   assert.equal(one.status,201);assert.equal(two.status,200);assert.equal(one.data.id,two.data.id);assert.equal(tables.tblqkKyk1HvE3rFKw.length,1);assert.equal(jobs.length,2);
   assert.match(tables.tblqkKyk1HvE3rFKw[0].fields.Notas,/Notas originales/);
 });
 await t.test('Respuesta de subida perdida: misma foto no se añade dos veces',async()=>{
   const photo={filename:'foto.jpg',contentType:'image/jpeg',file:Buffer.from('test-photo').toString('base64')};
   const path='/reports/'+first.id+'/photo';assert.equal((await call(path,'saul','POST',photo)).status,200);assert.equal((await call(path,'saul','POST',photo)).status,200);assert.equal(uploads,1);
   assert.equal((await call(path,'alex','POST',photo)).status,403);
 });
 await t.test('Un guardado lento no bloquea un trabajo diferente, pero sí dos cambios del mismo trabajo',async()=>{
   let release,enter;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
   const current=(await call('/jobs/'+jid+'/reports')).data.reports.find(r=>r.id===first.id);
   hold={id:first.id,enter,wait};const pending=call('/jobs/'+jid+'/reports','saul','POST',{...body('2026-11-05',4),expected:current.version});await entered;
   try{assert.equal((await call('/jobs/'+jid+'/reports','saul','POST',body('2026-11-07',1))).status,409);assert.equal((await call('/jobs/'+other+'/reports','saul','POST',body('2026-11-05',1))).status,200);}
   finally{hold=null;release();}assert.equal((await pending).status,200);
 });
 await t.test('Parte cerrado y registros históricos conservados',async()=>{
   const r=tables.tblprtqasdBxVVsNx[0];r.fields.Finalizado=true;
   const before=JSON.stringify(r);const result=await call('/jobs/'+jid+'/reports','saul','POST',{...body('2026-11-05',12),expected:(await call('/jobs/'+jid+'/reports')).data.reports[0].version});
   assert.equal(result.status,409);assert.equal(JSON.stringify(r),before);
 });
});
