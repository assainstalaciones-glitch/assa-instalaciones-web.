import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { reviewEvent, appendReview, validDate } from './workflow.mjs';

test('Fechas reales y auditoría sin migrar notas históricas',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-11-05'),true);
  assert.equal(reviewEvent({fields:{'Notas internas':'Histórico firmado'}}),null);
  const notes=appendReview('Original',{state:'pending'});
  assert.equal(reviewEvent({fields:{'Notas internas':appendReview(notes,{state:'approved'})}}).state,'approved');
});

test('Flujo HTTP completo con Airtable simulado; nunca usa datos reales',async t=>{
  process.env.AIRTABLE_TOKEN='pat-test-only';process.env.SESSION_SECRET='x'.repeat(40);
  process.env.BOOTSTRAP_USER='samuel';process.env.BOOTSTRAP_PASSWORD_HASH='scrypt$test$'+'0'.repeat(128);
  const {server,sign}=await import('./server.mjs');
  const jid='rec00000000000001',other='rec00000000000002',oid='rec00000000000003',rid='rec00000000000004';
  const tables={
    tblsVLKBSafEEiUlI:[{id:jid,fields:{'Trabajo / referencia':'Encargo','Nombre del Cliente':'Cliente simulado','Estado':'En progreso','Operarios asignados portal':'saul','Fecha prevista':'2026-11-05','Importe cobrado':500,'Cobro confirmado (portal)':true}},{id:other,fields:{'Estado':'En progreso','Operarios asignados portal':'alex'}}],
    tblZURy4PjvmL1Kr0:[{id:'rec00000000000005',fields:{'Usuario':'saul','Rol':'tecnico','Activo':true}},{id:'rec00000000000006',fields:{'Usuario':'alex','Rol':'tecnico','Activo':true}}],
    tblprtqasdBxVVsNx:[{id:rid,fields:{'Trabajo':[jid],'Usuario operario':'saul','Horas reales':2,'Observaciones':'Instalación probada','Fecha trabajo':'2026-11-05'}}],
    tblvZgkNh2cX1bTNx:[]
  };
  const writes=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,opts={})=>{
    const url=new URL(input);
    if(url.hostname==='127.0.0.1')return originalFetch(input,opts);
    assert.ok(['api.airtable.com','content.airtable.com'].includes(url.hostname));
    const method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
    if(url.hostname==='content.airtable.com'){
      const o=tables.tblvZgkNh2cX1bTNx.find(x=>x.id===url.pathname.split('/')[3]);
      o.fields['Parte firmado']=[{url:'https://example.invalid/test.pdf'}];writes.push({upload:true});return Response.json({});
    }
    const [,v,base,table,id]=url.pathname.split('/');assert.equal(base,'appdHOIMfkGPduA83');
    const records=tables[table]||[];
    if(method==='GET')return Response.json(id?records.find(r=>r.id===id):{records});
    writes.push({table,id,method,fields:body.fields});
    if(method==='PATCH'){const r=records.find(r=>r.id===id);assert.ok(r);Object.assign(r.fields,body.fields);return Response.json(r);}
    assert.ok(['tblvZgkNh2cX1bTNx','tblsVLKBSafEEiUlI'].includes(table));const r={id:table==='tblvZgkNh2cX1bTNx'?oid:'rec00000000000007',fields:{...body.fields,'Número de orden':'OT-SIMULADA'}};records.push(r);return Response.json(r);
  };
  t.after(()=>{globalThis.fetch=originalFetch;});
  const call=async(path,user='saul',method='GET',data)=>{
    const headers={'Content-Type':'application/json'};
    if(user)headers.Cookie='assa_session='+sign({user,role:user==='samuel'?'administrador':'tecnico',exp:Date.now()+60000});
    const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);
    req.url='/api'+path;req.method=method;req.headers={host:'localhost',cookie:headers.Cookie};req.socket={remoteAddress:'test'};
    let status=200,result;const res={setHeader(){},writeHead(code){status=code;},end(body){result=JSON.parse(String(body));}};
    await server.listeners('request')[0](req,res);
    return {status,data:result};
  };
  await t.test('Anónimo y técnico no acceden a dirección ni cierres',async()=>{
    assert.equal((await call('/admin/closures',null)).status,401);
    for(const p of ['/admin/dashboard','/admin/closures','/employees'])assert.equal((await call(p)).status,403);
  });
  await t.test('Técnico solo ve sus asignaciones y no recibe importes',async()=>{
    const r=await call('/jobs');assert.equal(r.data.jobs.length,1);assert.equal(r.data.jobs[0].id,jid);
    assert.ok(!JSON.stringify(r.data).includes('500'));assert.equal((await call('/jobs/'+other)).status,403);
  });
  await t.test('No puede asignar, cerrar sin revisión ni tocar cobros',async()=>{
    assert.equal((await call('/jobs/'+jid+'/schedule','saul','PATCH',{})).status,403);
    assert.equal((await call('/jobs/'+jid+'/approve-closure','saul','POST',{})).status,403);
    assert.equal((await call('/admin/jobs/'+jid+'/confirm','samuel','PATCH',{field:'paymentConfirmed',checked:false})).status,403);
    assert.equal(writes.length,0);
  });
  const schedule={users:['saul'],date:'2026-11-06',start:'09:00',end:'11:00',expected:{date:'2026-11-05',assigned:'saul'}};
  await t.test('Agenda valida fecha, técnico activo y conflicto de edición',async()=>{
    assert.equal((await call('/jobs/'+jid+'/schedule','samuel','PATCH',{...schedule,date:'2026-02-30'})).status,400);
    assert.equal((await call('/jobs/'+jid+'/schedule','samuel','PATCH',{...schedule,users:['nadie']})).status,400);
    assert.equal((await call('/jobs/'+jid+'/schedule','samuel','PATCH',schedule)).status,200);
    assert.equal((await call('/jobs/'+jid+'/schedule','samuel','PATCH',schedule)).status,409);
    assert.deepEqual(Object.keys(writes[0].fields).sort(),['Fecha prevista','Hora fin prevista (portal)','Hora inicio prevista (portal)','Operarios asignados portal']);
  });
  await t.test('Instalaciones en el mismo día: rechaza solape y permite una franja posterior; reintento sin duplicados',async()=>{
    const appointment={operationId:'11111111-1111-4111-8111-111111111111',date:'2026-11-06',start:'10:30',end:'12:00',users:['saul'],name:'Otro cliente',phone:'600123456',address:'Cambrils',description:'Otra instalación',kind:'installation'};
    assert.equal((await call('/appointments','saul','POST',appointment)).status,403);
    assert.equal((await call('/appointments','samuel','POST',appointment)).status,409);
    appointment.start='11:00';const result=await call('/appointments','samuel','POST',appointment);assert.equal(result.status,201,JSON.stringify(result.data));
    const n=writes.length;assert.equal((await call('/appointments','samuel','POST',appointment)).status,200);assert.equal(writes.length,n);
    assert.equal(tables.tblsVLKBSafEEiUlI.length,3);assert.equal(result.data.job.start,'11:00');
  });
  await t.test('Dos técnicos distintos pueden trabajar en paralelo; fin anterior al inicio se rechaza',async()=>{
    const appointment={users:['alex'],date:'2026-11-06',start:'09:00',end:'11:00',expected:{date:'',assigned:'alex'}};
    assert.equal((await call('/jobs/'+other+'/schedule','samuel','PATCH',{...appointment,end:'08:00'})).status,400);
    assert.equal((await call('/jobs/'+other+'/schedule','samuel','PATCH',appointment)).status,200);
  });
  await t.test('Dirección corrige ficha y parte de Saúl en Presupuesto pendiente, con motivo y sin cerrar el trabajo',async()=>{
    const job=tables.tblsVLKBSafEEiUlI[0],report=tables.tblprtqasdBxVVsNx[0];job.fields.Estado='Presupuesto pendiente';
    assert.equal((await call('/jobs/'+jid+'/direction-edit','saul')).status,403);
    const current=(await call('/jobs/'+jid+'/direction-edit','samuel')).data;
    const correction={operationId:'22222222-2222-4222-8222-222222222222',expected:current.version,reason:'Corregir el diagnóstico de la visita',changes:{description:'Diagnóstico y presupuesto de reparación'},reportId:rid,reportChanges:{hours:1,notes:'Es necesario soldar antes de restablecer la presión.'}};
    assert.equal((await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',{...correction,reason:''})).status,400);
    assert.equal((await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',{...correction,changes:{paymentConfirmed:'false'}})).status,400);
    const r=await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',correction);assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(job.fields.Estado,'Presupuesto pendiente');assert.equal(report.fields['Usuario operario'],'saul');assert.equal(report.fields['Horas reales'],1);
    assert.equal(JSON.parse(job.fields['Historial dirección (portal)'])[0].reportBefore['Horas reales'],2);
    const count=writes.length;assert.equal((await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',correction)).status,200);assert.equal(writes.length,count);
    assert.equal((await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',{...correction,operationId:'33333333-3333-4333-8333-333333333333'})).status,409);
    job.fields.Estado='En progreso';
  });
  const signature='data:image/png;base64,'+Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2sAAAAASUVORK5CYII=','base64'),Buffer.alloc(150)]).toString('base64');
  await t.test('Firma conserva PDF y parte, deja trabajo abierto para Samuel',async()=>{
    const r=await call('/jobs/'+jid+'/sign','saul','POST',{signer:'Cliente simulado',accepted:true,signature});
    assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(tables.tblsVLKBSafEEiUlI[0].fields.Estado,'En progreso');
    assert.equal(tables.tblprtqasdBxVVsNx[0].fields.Finalizado,true);
    assert.equal(reviewEvent(tables.tblvZgkNh2cX1bTNx[0]).state,'pending');
    assert.equal((await call('/admin/closures','samuel')).data.closures.length,1);
  });
  await t.test('Firma repetida no duplica OT y ejecución firmada no se sobrescribe',async()=>{
    assert.equal((await call('/jobs/'+jid+'/sign','saul','POST',{signer:'Cliente simulado',accepted:true,signature})).status,403);
    assert.equal(tables.tblvZgkNh2cX1bTNx.length,1);
    assert.equal((await call('/jobs/'+jid+'/reports','saul','POST',{hours:3})).status,403);
    assert.equal((await call('/jobs','saul')).data.jobs.some(j=>j.id===jid),false);
    assert.equal((await call('/jobs/'+jid,'saul')).status,403);
    assert.equal((await call('/jobs/'+jid,'samuel')).status,200);
    assert.equal((await call('/jobs/'+jid+'/schedule','samuel','PATCH',{...schedule,expected:{date:'2026-11-06',assigned:'saul'}})).status,409);
  });
  await t.test('Samuel aprueba una sola vez, con auditoría y sin datos financieros',async()=>{
    assert.equal((await call('/jobs/'+jid+'/approve-closure','samuel','POST',{orderId:oid})).status,200);
    const count=writes.length;
    assert.equal((await call('/jobs/'+jid+'/approve-closure','samuel','POST',{orderId:oid})).status,200);assert.equal(writes.length,count);
    assert.equal(tables.tblsVLKBSafEEiUlI[0].fields.Estado,'Terminado');assert.equal(reviewEvent(tables.tblvZgkNh2cX1bTNx[0]).reviewer,'samuel');
    assert.equal((await call('/jobs')).data.jobs.some(j=>j.id===jid),false);
    for(const w of writes)for(const k of Object.keys(w.fields||{}))assert.ok(!/factura|cobro|cobrado|importe/i.test(k));
  });
  await t.test('Un parte firmado admite rectificación auditada de dirección, conservando el original y su PDF',async()=>{
    const current=(await call('/jobs/'+jid+'/direction-edit','samuel')).data,report=tables.tblprtqasdBxVVsNx[0],original=JSON.stringify(report),pdf=JSON.stringify(tables.tblvZgkNh2cX1bTNx[0]);
    const correction={operationId:'44444444-4444-4444-8444-444444444444',expected:current.version,reason:'Aclaración posterior de las horas',changes:{address:'Dirección corregida'},reportId:rid,reportChanges:{hours:1.5}};
    const r=await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',correction);assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(JSON.stringify(report),original);assert.equal(JSON.stringify(tables.tblvZgkNh2cX1bTNx[0]),pdf);
    assert.equal(tables.tblsVLKBSafEEiUlI[0].fields.Estado,'Terminado');
    const history=(await call('/jobs/'+jid+'/direction-edit','samuel')).data.history;assert.equal(history.at(-1).reportMode,'annotation');assert.equal(history.at(-1).reportAfter['Horas reales'],1.5);
  });
  await t.test('Desactivar técnico revoca acceso; rol desconocido no autentica',async()=>{
    tables.tblZURy4PjvmL1Kr0[0].fields.Activo=false;assert.equal((await call('/me')).status,401);
    tables.tblZURy4PjvmL1Kr0[0].fields.Activo=true;tables.tblZURy4PjvmL1Kr0[0].fields.Rol='desconocido';assert.equal((await call('/me')).status,401);
  });
});
