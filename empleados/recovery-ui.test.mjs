import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import * as recovery from './public/recovery.js';
import * as calendar from './public/calendar.js';
import {fifteenDayRange} from './public/partner-installations.js';

function harness(){
 const drafts=new Map(),elements=new Map(),calls=[];
 const node=()=>({textContent:'',innerHTML:'',dataset:{},addEventListener(){}});
 const app=node(),toast=node();elements.set('#app',app);elements.set('#toast',toast);
 let photoFailure=true;
 const context=vm.createContext({console,setTimeout,clearTimeout,Intl,Date,crypto:{randomUUID},document:{querySelector:s=>elements.get(s)||node()},...calendar,fifteenDayRange,...recovery,
  loadDraft:async key=>structuredClone(drafts.get(key)||null),saveDraft:async(key,value)=>drafts.set(key,structuredClone(value)),clearDraft:async key=>drafts.delete(key),
  FormData:class {constructor(form){this.form=form;}entries(){return Object.entries(this.form.inputs).filter(([,v])=>!v.disabled).map(([k,v])=>[k,v.value])[Symbol.iterator]();}},
  fetch:async(url,options)=>{calls.push(url);if(url==='/api/visits')return Response.json({id:'rec00000000000055'});if(url.endsWith('/photo')){if(photoFailure){photoFailure=false;return Response.json({error:'Fallo temporal de foto'},{status:502});}return Response.json({ok:true});}throw Error('Unexpected route '+url);}});
 const code=readFileSync(new URL('./public/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/init\(\);\s*$/,'');
 vm.runInContext(code+'\nglobalThis.ui={state,bindRecovery,submitRecoverable};',context);
 function form(values){const handlers={},status=node(),button={...node(),disabled:false,textContent:'Guardar'};
   const f={inputs:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{name,value,type:'text',disabled:false}])),inert:false,handlers,
   addEventListener(name,fn){handlers[name]=fn;},querySelector(s){if(s==='#draftStatus')return status;if(s==='#photos')return null;if(s==='[type=submit]')return button;return null;},querySelectorAll(){return Object.values(this.inputs);}};
   f.elements={namedItem:name=>f.inputs[name]};return f;
 }
 return {...context.ui,drafts,calls,form};
}
test('El borrador se recupera tras recargar y conserva un ID de visita; foto fallida se reintenta sin crear otra visita',async()=>{
 const h=harness(),key=recovery.draftKey('saul','visit');
 const a=h.form({title:'Visita simulada',address:'Cambrils',notes:'Medidas reales'}),ctx=h.bindRecovery(a,key);await ctx.ready;a.handlers.input();await ctx.queue;
 assert.equal(h.drafts.get(key).fields.notes,'Medidas reales');
 const reloaded=h.form({title:'',address:'',notes:''}),restored=h.bindRecovery(reloaded,key);await restored.ready;
 assert.equal(reloaded.inputs.notes.value,'Medidas reales');assert.equal(restored.operationId,ctx.operationId);
 restored.uploads=[{filename:'foto.jpg',contentType:'image/jpeg',file:'dGVzdA=='}];await restored.persist();
 await assert.rejects(h.submitRecoverable(reloaded,'visit','/visits'),/Fallo temporal/);
 assert.equal(restored.remoteId,'rec00000000000055');assert.equal(h.drafts.get(key).uploads.length,1);
 const retry=h.form({title:'',address:'',notes:''}),retryCtx=h.bindRecovery(retry,key);await retryCtx.ready;
 assert.equal(retry.inputs.title.disabled,true);
 assert.equal(await h.submitRecoverable(retry,'visit','/visits'),'rec00000000000055');
 assert.equal(h.calls.filter(x=>x==='/api/visits').length,1);assert.equal(h.calls.filter(x=>x.endsWith('/photo')).length,2);assert.equal(h.drafts.has(key),false);
});
