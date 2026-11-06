import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { reviewEvent, appendReview, validDate } from './workflow.mjs';
import {OUTCOMES,outcomeVersion} from './public/outcomes.js';
import {REL_FIELDS,relationshipVersion} from './public/relationships.js';
import {INSTALLATION_FIELDS as I,INSTALLATION_MODE} from './public/partner-installations.js';

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
    tblvZgkNh2cX1bTNx:[],
    tblKc1Tvz45Fu5J9b:[]
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
    assert.ok(['tblvZgkNh2cX1bTNx','tblsVLKBSafEEiUlI','tblKc1Tvz45Fu5J9b'].includes(table));const r={id:table==='tblvZgkNh2cX1bTNx'?oid:'rec'+String(records.length+100).padStart(14,'0'),fields:{...body.fields,'Número de orden':'OT-SIMULADA'}};records.push(r);return Response.json(r);
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
   await t.test('Cita libre sin cliente, intermediario ni técnico; permisos y reintento sin duplicar',async()=>{
  const initialJobs=tables.tblsVLKBSafEEiUlI.length;
  const b={operationId:'12345678-1234-4123-8123-123456789aba',title:'Reunión con proveedor',date:'2026-11-09',start:'',end:'',kind:'Reunión',location:'Oficina',notes:'Traer catálogo'};
  assert.equal((await call('/agenda-notes','saul')).status,403);assert.equal((await call('/agenda-notes','saul','POST',b)).status,403);
  const first=await call('/agenda-notes','samuel','POST',b);assert.equal(first.status,201,JSON.stringify(first.data));assert.equal(first.data.note.title,b.title);
  assert.equal(tables.tblsVLKBSafEEiUlI.length,initialJobs);
  const before=writes.length;assert.equal((await call('/agenda-notes','samuel','POST',b)).status,200);assert.equal(writes.length,before);
  const view=await call('/agenda-notes','samuel');assert.equal(view.status,200);assert.equal(view.data.notes.length,1);
  assert.equal((await call('/agenda-notes','samuel','POST',{...b,operationId:'12345678-1234-4123-8123-123456789abb',date:'2026-02-30'})).status,400);
  assert.equal((await call('/agenda-notes','samuel','POST',{...b,operationId:'12345678-1234-4123-8123-123456789abc',end:'10:00'})).status,400);
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
  await t.test('Regresión descripción de 252 caracteres: corregir el parte no reescribe ni bloquea la descripción existente',async()=>{
    const job=tables.tblsVLKBSafEEiUlI[0];job.fields['Descripción del trabajo']='d'.repeat(252);
    const current=(await call('/jobs/'+jid+'/direction-edit','samuel')).data;
    const b={operationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expected:current.version,reason:'Corrección de observaciones',changes:{description:job.fields['Descripción del trabajo']},reportId:rid,reportChanges:{notes:'Observaciones corregidas sin recortar la descripción'}};
    const r=await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',b);assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(job.fields['Descripción del trabajo'],'d'.repeat(252));assert.equal(Object.hasOwn(JSON.parse(job.fields['Historial dirección (portal)']).at(-1).after,'Descripción del trabajo'),false);
  });
  await t.test('La descripción editada admite texto largo sin recorte y los límites identifican el campo',async()=>{
    const current=(await call('/jobs/'+jid+'/direction-edit','samuel')).data;
    const b={operationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',expected:current.version,reason:'Ampliación de descripción',changes:{description:'Descripción completa. '.repeat(40)}};
    const r=await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',b);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(tables.tblsVLKBSafEEiUlI[0].fields['Descripción del trabajo'],b.changes.description.trim());
    const updated=(await call('/jobs/'+jid+'/direction-edit','samuel')).data,count=writes.length;
    const invalid=await call('/jobs/'+jid+'/direction-edit','samuel','PATCH',{...b,operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',expected:updated.version,changes:{description:'x'.repeat(10001)}});
    assert.equal(invalid.status,400);assert.match(invalid.data.error,/Descripción del trabajo/);assert.match(invalid.data.error,/10000/);assert.equal(writes.length,count);
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
  const outcomeId='rec00000000000009';
  tables.tblsVLKBSafEEiUlI.push({id:outcomeId,fields:{'Nombre del Cliente':'Visita de ejemplo','Estado':'En progreso','Operarios asignados portal':'saul','Importe cobrado':20,'Cobro confirmado (portal)':true}});
  const outcomeBody=async(code,n=5)=>({code,reason:'Motivo y seguimiento de ejemplo',operationId:String(n).repeat(8)+'-'+String(n).repeat(4)+'-4'+String(n).repeat(3)+'-8'+String(n).repeat(3)+'-'+String(n).repeat(12),expected:outcomeVersion((await call('/jobs/'+outcomeId,'samuel')).data.job)});
  await t.test('Técnico comunica desistimiento; Samuel confirma cierre sin modificar cobro ni exigir firma de trabajo no realizado',async()=>{
    const b=await outcomeBody('declined');const status=tables.tblsVLKBSafEEiUlI.at(-1).fields.Estado;
    const proposal=await call('/jobs/'+outcomeId+'/outcomes','saul','POST',b);assert.equal(proposal.status,200,JSON.stringify(proposal.data));assert.equal(proposal.data.pending,true);assert.equal(tables.tblsVLKBSafEEiUlI.at(-1).fields.Estado,status);
    const requests=(await call('/admin/outcomes','samuel')).data.requests;const request=requests.find(r=>r.job.id===outcomeId);assert.ok(request);
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes/'+request.id+'/decision','saul','POST',{decision:'approve'})).status,403);
    const decision=await call('/jobs/'+outcomeId+'/outcomes/'+request.id+'/decision','samuel','POST',{decision:'approve'});assert.equal(decision.status,200,JSON.stringify(decision.data));
    const fields=tables.tblsVLKBSafEEiUlI.at(-1).fields;assert.equal(fields.Estado,'No aceptado / Sin respuesta');assert.equal(fields['Resultado intervención (portal)'],OUTCOMES.find(o=>o.code==='declined').label);assert.equal(fields['Importe cobrado'],20);assert.equal(fields['Cobro confirmado (portal)'],true);
    const count=writes.length;assert.equal((await call('/jobs/'+outcomeId+'/outcomes/'+request.id+'/decision','samuel','POST',{decision:'approve'})).status,200);assert.equal(writes.length,count);
  });
  await t.test('Visita diagnosticada pendiente de presupuesto permanece abierta comercialmente y conserva los partes',async()=>{
    const reportBefore=JSON.stringify(tables.tblprtqasdBxVVsNx);const b=await outcomeBody('quote',6);
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes','samuel','POST',b)).status,200);
    assert.equal(tables.tblsVLKBSafEEiUlI.at(-1).fields.Estado,'Presupuesto pendiente');assert.equal(JSON.stringify(tables.tblprtqasdBxVVsNx),reportBefore);
  });
  await t.test('Material y nueva visita dejan el caso pendiente de la siguiente acción, sin cerrar ni cobrar',async()=>{
    const fields=tables.tblsVLKBSafEEiUlI.at(-1).fields;
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes','samuel','POST',await outcomeBody('materials',1))).status,200);assert.equal(fields.Estado,'Aceptado / Programado');
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes','samuel','POST',await outcomeBody('revisit',2))).status,200);assert.equal(fields.Estado,'Pendiente de visita');assert.equal(fields['Importe cobrado'],20);
  });
  await t.test('No realizado y cancelado son cierres operativos independientes; facturación existente se conserva',async()=>{
    const fields=tables.tblsVLKBSafEEiUlI.at(-1).fields;
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes','samuel','POST',await outcomeBody('not_possible',7))).status,200);assert.equal(fields.Estado,'Cancelado');
    fields.Estado='Facturado';fields['Ref. factura']='FACTURA-SIMULADA';
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes','samuel','POST',await outcomeBody('cancelled',8))).status,200);
    assert.equal(fields.Estado,'Facturado');assert.equal(fields['Ref. factura'],'FACTURA-SIMULADA');assert.equal(fields['Importe cobrado'],20);
  });
  await t.test('Terminado exige PDF firmado; se puede descartar la solicitud sin modificar el estado',async()=>{
    const b=await outcomeBody('completed',9),fields=tables.tblsVLKBSafEEiUlI.at(-1).fields,previous=fields.Estado;
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes','samuel','POST',b)).status,409);assert.equal(fields.Estado,previous);
    assert.equal((await call('/admin/outcomes','samuel')).data.requests.some(r=>r.job.id===outcomeId),false);
    fields.Estado='En progreso';const proposal=await outcomeBody('quote',3);assert.equal((await call('/jobs/'+outcomeId+'/outcomes','saul','POST',proposal)).status,200);
    const request=(await call('/admin/outcomes','samuel')).data.requests.find(r=>r.job.id===outcomeId);assert.ok(request);
    assert.equal((await call('/jobs/'+outcomeId+'/outcomes/'+request.id+'/decision','samuel','POST',{decision:'reject',reason:'Todavía no se ha realizado el trabajo'})).status,200);assert.equal(fields.Estado,'En progreso');
  });
  await t.test('Trabajo terminado con firma conserva su PDF y no confirma el cobro',async()=>{
    const job=(await call('/jobs/'+jid,'samuel')).data.job,document=JSON.stringify(tables.tblvZgkNh2cX1bTNx[0]);
    const r=await call('/jobs/'+jid+'/outcomes','samuel','POST',{code:'completed',reason:'Trabajo revisado y ejecución terminada',operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expected:outcomeVersion(job)});
    assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(JSON.stringify(tables.tblvZgkNh2cX1bTNx[0]),document);assert.equal(tables.tblsVLKBSafEEiUlI[0].fields.Estado,'Terminado');assert.equal(tables.tblsVLKBSafEEiUlI[0].fields['Importe cobrado'],500);
  });
  const partnerId='rec00000000000010',fiscalId='rec00000000000011',beneficiaryId='rec00000000000012',relationJob='rec00000000000013';
  tables.tblXXBlGHp5UByNj4=[{id:partnerId,fields:{Nombre:'Colaborador de ejemplo','Papel habitual':'Intermediario','Cliente relacionado':[fiscalId]}}];
  tables.tblGzayqdlCpz90vx=[{id:fiscalId,fields:{Nombre:'Empresa de ejemplo'}},{id:beneficiaryId,fields:{Nombre:'Beneficiario de ejemplo',Teléfono:'600111222'}}];
  tables.tblsVLKBSafEEiUlI.push({id:relationJob,fields:{Estado:'En progreso','Operarios asignados portal':'saul',Cliente:[beneficiaryId],'Ref. factura':'FACTURA-CONSERVADA','Importe cobrado':100}});
  await t.test('Relaciones del encargo: solo Samuel, auditoría, reintento seguro y pagador no deducido del intermediario',async()=>{
    assert.equal((await call('/collaborators','saul')).status,403);assert.equal((await call('/collaborators','samuel')).data.collaborators[0].name,'Colaborador de ejemplo');
    const job=(await call('/jobs/'+relationJob,'samuel')).data.job;
    const payload={operationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',expected:relationshipVersion(job),reason:'Encargo derivado; acceso con la inquilina',relationships:{partnerId,partnerRole:'Intermediario',occupant:'Inquilina de ejemplo',occupantRole:'Inquilino',accessPhone:'600222333'}};
    assert.equal((await call('/jobs/'+relationJob+'/relationships','saul','PATCH',payload)).status,403);
    const r=await call('/jobs/'+relationJob+'/relationships','samuel','PATCH',payload);assert.equal(r.status,200,JSON.stringify(r.data));
    const fields=tables.tblsVLKBSafEEiUlI.find(j=>j.id===relationJob).fields;assert.equal(fields[REL_FIELDS.partnerName],'Colaborador de ejemplo');assert.equal(Object.hasOwn(fields,REL_FIELDS.invoiceTo),false);assert.deepEqual(fields.Cliente,[beneficiaryId]);assert.equal(fields['Ref. factura'],'FACTURA-CONSERVADA');assert.equal(fields['Importe cobrado'],100);
    const count=writes.length;assert.equal((await call('/jobs/'+relationJob+'/relationships','samuel','PATCH',payload)).status,200);assert.equal(writes.length,count);
    assert.equal((await call('/jobs/'+relationJob+'/relationships','samuel','PATCH',{...payload,operationId:'ffffffff-ffff-4fff-8fff-ffffffffffff'})).status,409);
    const current=(await call('/jobs/'+relationJob,'samuel')).data.job;assert.equal((await call('/jobs/'+relationJob+'/relationships','samuel','PATCH',{...payload,operationId:'ffffffff-ffff-4fff-8fff-ffffffffffff',expected:relationshipVersion(current),relationships:{invoiceTo:fiscalId}})).status,200);assert.deepEqual(fields[REL_FIELDS.invoiceTo],[fiscalId]);assert.deepEqual(fields.Cliente,[beneficiaryId]);
    const tech=(await call('/jobs/'+relationJob,'saul')).data.job;assert.equal(tech.occupant,'Inquilina de ejemplo');assert.equal(tech.accessPhone,'600222333');assert.equal(Object.hasOwn(tech,'invoiceTo'),false);
  });
  await t.test('Agenda nueva conserva separados colaborador, beneficiario, ficha existente y destinatario previsto',async()=>{
    const result=await call('/appointments','samuel','POST',{operationId:'abcdabcd-abcd-4abc-8abc-abcdabcdabcd',kind:'visit',users:['saul'],date:'2026-12-10',start:'09:00',end:'10:00',clientId:beneficiaryId,address:'Obra de ejemplo',description:'Visita derivada',relationships:{partnerId,partnerRole:'Intermediario',occupant:'Beneficiario de ejemplo',occupantRole:'Inquilino',invoiceTo:fiscalId}});
    assert.equal(result.status,201,JSON.stringify(result.data));const fields=tables.tblsVLKBSafEEiUlI.at(-1).fields;assert.deepEqual(fields.Cliente,[beneficiaryId]);assert.deepEqual(fields[REL_FIELDS.partnerId],[partnerId]);assert.deepEqual(fields[REL_FIELDS.invoiceTo],[fiscalId]);assert.equal(Object.hasOwn(fields,'Ref. factura'),false);assert.equal(Object.hasOwn(fields,'Importe cobrado'),false);
  });
  let partnerInstallationId;
  await t.test('Otro colaborador permite recordar reparación sin datos finales ni pagador; se resuelve en el mismo trabajo con historial',async()=>{
    const payload={operationId:'72345678-1234-4123-8123-123456789abc',kind:'installation',billingMode:'partner',users:['saul'],date:'2026-12-24',start:'09:00',address:'Dirección reparación de gas',description:'Reparación de gas · encargo por resolver',relationships:{partnerId:'other',partnerOther:'Encargo de mi primo'}};
    const r=await call('/appointments','samuel','POST',payload);assert.equal(r.status,201,JSON.stringify(r.data));const id=r.data.job.id;assert.equal(r.data.job.partnerId,'other');assert.equal(r.data.job.partnerOther,'Encargo de mi primo');assert.equal(r.data.job.end,'');
    const fields=tables.tblsVLKBSafEEiUlI.find(j=>j.id===id).fields;assert.ok(!fields.Cliente);assert.ok(!fields[REL_FIELDS.invoiceTo]);assert.ok(!fields[REL_FIELDS.partnerId]?.length);assert.ok(!fields[REL_FIELDS.partnerRole]);
    const summary=(await call('/admin/partner-installations?from=2026-12-24&to=2026-12-24&partnerId=other','samuel')).data;assert.equal(summary.rows.length,1);assert.equal(summary.counts.toPrepareUnits,0);
    const count=tables.tblsVLKBSafEEiUlI.length;assert.equal((await call('/appointments','samuel','POST',payload)).status,200);assert.equal(tables.tblsVLKBSafEEiUlI.length,count);
    const body={operationId:'62345678-1234-4123-8123-123456789abc',expected:relationshipVersion(r.data.job),reason:'Confirmado el origen del encargo; facturación aún pendiente',relationships:{partnerId,partnerRole:'Intermediario'}};
    assert.equal((await call('/jobs/'+id+'/relationships','saul','PATCH',body)).status,403);assert.equal((await call('/jobs/'+id+'/relationships','samuel','PATCH',body)).status,200);assert.equal(tables.tblsVLKBSafEEiUlI.length,count);assert.ok(fields['Historial dirección (portal)'].includes('Encargo de mi primo'));assert.deepEqual(fields[REL_FIELDS.partnerId],[partnerId]);assert.ok(!fields.Cliente);assert.ok(!fields[REL_FIELDS.invoiceTo]);assert.ok(!fields['Ref. factura']);assert.ok(!fields['Importe cobrado']);
  });
  await t.test('Reserva solo con entrada; salida real en parte independiente de la agenda, con validación y permisos',async()=>{
    const payload={operationId:'92345678-1234-4123-8123-123456789abc',kind:'installation',billingMode:'partner',users:['saul'],date:'2026-12-20',start:'09:00',address:'Dirección sin fin previsto',relationships:{partnerId}};
    const r=await call('/appointments','samuel','POST',payload);assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.job.end,'');assert.ok(r.data.warnings.length);
    const id=r.data.job.id;assert.equal((await call('/appointments','samuel','POST',{...payload,operationId:'82345678-1234-4123-8123-123456789abc'})).status,409);
    assert.equal((await call('/appointments','samuel','POST',{...payload,operationId:'82345678-1234-4123-8123-123456789abc',date:'2026-12-21',end:'08:00'})).status,400);
    // Existing open technician report avoids manufacturing records outside the HTTP fixture's create contract.
    tables.tblprtqasdBxVVsNx.push({id:'rec00000000000045',fields:{Trabajo:[id],'Usuario operario':'saul'}});
    const body={hours:2,date:'2026-12-20',actualStart:'09:05',actualEnd:'11:05',notes:'Instalación realizada',material:''};
    const saved=await call('/jobs/'+id+'/reports','saul','POST',body);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.report.actualEnd,'11:05');assert.equal(saved.data.report.actualStart,'09:05');
    assert.equal((await call('/jobs/'+id,'samuel')).data.job.end,'');
    assert.equal((await call('/jobs/'+id+'/reports','alex','POST',body)).status,403);
    const before=writes.length;assert.equal((await call('/jobs/'+id+'/reports','saul','POST',{...body,actualEnd:'08:00'})).status,400);assert.equal(writes.length,before);
    const oldClient=await call('/jobs/'+id+'/reports','saul','POST',{hours:2,date:'2026-12-20',notes:'Actualiza notas',material:''});assert.equal(oldClient.data.report.actualEnd,'11:05');
  });
  await t.test('Instalación para colaborador: basta dirección y agenda, sin nombre, teléfono ni ficha del cliente final',async()=>{
    const payload={operationId:'12345678-1234-4123-8123-123456789abc',kind:'installation',billingMode:'partner',users:['saul'],date:'2026-11-06',start:'15:00',end:'16:00',address:'Dirección de la instalación',clientId:beneficiaryId,name:'Dato de cliente final que debe ignorarse',phone:'600999999',relationships:{partnerId}};
    const result=await call('/appointments','samuel','POST',payload);assert.equal(result.status,201,JSON.stringify(result.data));partnerInstallationId=result.data.job.id;
    const fields=tables.tblsVLKBSafEEiUlI.find(j=>j.id===partnerInstallationId).fields;assert.equal(fields['Nombre del Cliente'],'Colaborador de ejemplo');assert.equal(fields['Número de teléfono'],'');assert.equal(Object.hasOwn(fields,'Cliente'),false);assert.equal(fields[I.mode],INSTALLATION_MODE);assert.equal(fields[I.units],1);assert.equal(fields[REL_FIELDS.partnerRole],'Contratista');assert.equal(Object.hasOwn(fields,REL_FIELDS.occupant),false);assert.equal(Object.hasOwn(fields,REL_FIELDS.invoiceTo),false);
    const count=writes.length;assert.equal((await call('/appointments','samuel','POST',payload)).status,200);assert.equal(writes.length,count);
    assert.equal((await call('/appointments','samuel','POST',{...payload,operationId:'22345678-1234-4123-8123-123456789abc',date:'2026-11-08',units:0})).status,400);
  });
  await t.test('Instalador envía instalación terminada sin firma de cliente final y Samuel la incluye al aprobar el parte',async()=>{
    const reportId='rec00000000000040';tables.tblprtqasdBxVVsNx.push({id:reportId,fields:{Trabajo:[partnerInstallationId],'Usuario operario':'saul','Horas reales':1,Observaciones:'Instalación realizada y probada','Fecha trabajo':'2026-11-07'}});
    const current=(await call('/jobs/'+partnerInstallationId,'samuel')).data.job,countOrders=tables.tblvZgkNh2cX1bTNx.length;
    const body={operationId:'32345678-1234-4123-8123-123456789abc',code:'completed',reason:'Instalación realizada y enviada a revisión',expected:outcomeVersion(current)};
    const request=await call('/jobs/'+partnerInstallationId+'/outcomes','saul','POST',body);assert.equal(request.status,200,JSON.stringify(request.data));assert.equal(request.data.pending,true);
    const before=(await call('/admin/partner-installations?from=2026-11-01&to=2026-11-15&partnerId='+partnerId,'samuel')).data;assert.equal(before.counts.completedUnits,0);
    assert.equal((await call('/jobs/'+partnerInstallationId+'/outcomes/outcome-'+body.operationId+'/decision','samuel','POST',{decision:'approve'})).status,200);
    const fields=tables.tblsVLKBSafEEiUlI.find(j=>j.id===partnerInstallationId).fields;assert.equal(fields.Estado,'Terminado');assert.equal(fields[I.executedOn],'2026-11-07');assert.equal(tables.tblvZgkNh2cX1bTNx.length,countOrders);assert.equal(tables.tblprtqasdBxVVsNx.find(r=>r.id===reportId).fields.Finalizado,true);
    const beforeReads=writes.length;const summary=await call('/admin/partner-installations?from=2026-11-07&to=2026-11-21&partnerId='+partnerId,'samuel');assert.equal(summary.status,200);assert.equal(summary.data.counts.completedUnits,1);assert.equal(summary.data.counts.toPrepareUnits,1);assert.equal(writes.length,beforeReads);assert.equal((await call('/admin/partner-installations?from=2026-11-01&to=2026-11-15','saul')).status,403);
  });
  await t.test('Samuel puede corregir unidades y fecha real con historial para el recuento, sin tocar importes',async()=>{
    const current=(await call('/jobs/'+partnerInstallationId+'/direction-edit','samuel')).data;
    const r=await call('/jobs/'+partnerInstallationId+'/direction-edit','samuel','PATCH',{operationId:'42345678-1234-4123-8123-123456789abc',expected:current.version,reason:'Dos instalaciones en la misma dirección; confirmar fecha real',changes:{installationUnits:'2',executedOn:'2026-11-08'}});
    assert.equal(r.status,200,JSON.stringify(r.data));const summary=(await call('/admin/partner-installations?from=2026-11-08&to=2026-11-22&partnerId='+partnerId,'samuel')).data;assert.equal(summary.counts.completedJobs,1);assert.equal(summary.counts.completedUnits,2);assert.equal(summary.counts.toPrepareUnits,2);
    assert.equal((await call('/admin/partner-installations?from=2026-11-07&to=2026-11-07&partnerId='+partnerId,'samuel')).data.counts.completedUnits,0);
  });
  await t.test('Desactivar técnico revoca acceso; rol desconocido no autentica',async()=>{
    tables.tblZURy4PjvmL1Kr0[0].fields.Activo=false;assert.equal((await call('/me')).status,401);
    tables.tblZURy4PjvmL1Kr0[0].fields.Activo=true;tables.tblZURy4PjvmL1Kr0[0].fields.Rol='desconocido';assert.equal((await call('/me')).status,401);
  });
});

