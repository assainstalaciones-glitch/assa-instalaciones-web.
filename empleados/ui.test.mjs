import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('Pantallas de dirección, agenda y parte conservan acceso y contactos',()=>{
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',addEventListener(){},querySelector:x=>node(x),querySelectorAll:()=>[],getContext:()=>({fillRect(){}})});return nodes.get(id);};
  const context=vm.createContext({document:{querySelector:node},console,setTimeout,clearTimeout,Intl,Date});
  const code=readFileSync(new URL('./public/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'').replace(/init\(\);\s*$/,'');
  vm.runInContext("const mapsDestination=(a,b)=>b||a;\n"+code+"\nglobalThis.ui={state,renderAgenda,renderDashboard,renderWork,renderSign};",context);
  const ui=context.ui,app=node('#app');
  const job={id:'rec00000000000001',client:'Cliente <prueba>',reference:'Trabajo',status:'En progreso',assigned:'saul',address:'Calle Mayor, Cambrils',phone:'600123456',date:'2026-11-05'};
  ui.state.me={username:'samuel',role:'administrador',name:'Samuel'};ui.state.jobs=[job];ui.state.employees=[{username:'saul',active:true,role:'tecnico'}];
  ui.renderAgenda();assert.match(app.innerHTML,/Agenda técnica/);assert.match(app.innerHTML,/Cliente &lt;prueba&gt;/);assert.match(app.innerHTML,/tel:600123456/);assert.match(app.innerHTML,/google.com\/maps/);assert.match(app.innerHTML,/data-nav="dashboard"/);
  ui.state.dashboard={};ui.state.closures=[{id:'rec00000000000003',job,event:{submittedBy:'saul'},signed:true}];ui.state.canApprove=true;
  ui.renderDashboard();assert.match(app.innerHTML,/Cierres pendientes de Samuel/);assert.match(app.innerHTML,/data-approve-job=/);
  ui.state.job=job;ui.renderWork();assert.match(app.innerHTML,/scheduleDate/);assert.match(app.innerHTML,/Parte de ejecución/);assert.match(app.innerHTML,/Fotografías del trabajo/);
  ui.state.me={username:'saul',role:'tecnico'};ui.renderAgenda();assert.doesNotMatch(app.innerHTML,/data-nav="dashboard"/);assert.doesNotMatch(app.innerHTML,/agendaTech/);
  ui.renderWork();assert.doesNotMatch(app.innerHTML,/saveAssign/);assert.match(app.innerHTML,/Firmar y enviar a revisión/);
});
