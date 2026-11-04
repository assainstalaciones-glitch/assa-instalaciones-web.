// Precio de venta aceptado, sin confundirlo con costes de compra o importes sin validar.
export function confirmedBudget({budget='',status='',total,net,description=''}) {
 const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>0?Math.round(x*100)/100:null;
 const gross=amount(total),netSale=amount(net);
 const accepted=['Aceptado / Programado','En progreso'].includes(status);
 if(!budget||!accepted||gross===null)return {verified:false,reason:'Sin presupuesto aceptado e importe total confirmado'};
 const candidates=[];
 if(netSale!==null)candidates.push(netSale);
 const matches=[...String(description).matchAll(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*€\s*\+\s*IVA\b/gi)];
 if(matches.length===1){
   const t=matches[0][1].replace(/\./g,'').replace(',','.');
   const n=amount(Number(t));if(n!==null)candidates.push(n);
 }
 const possibilities=[];
 for(const base of candidates){for(const vat of [.21,.10,.04]){
   if(Math.abs(Math.round(base*(1+vat)*100)/100-gross)<=.03)possibilities.push({base,vat,total:gross});
 }}
 if(!possibilities.length)return {verified:false,reason:'Precio y total sin concordancia verificada'};
 if(possibilities.some(x=>x.base!==possibilities[0].base||x.vat!==possibilities[0].vat))
   return {verified:false,reason:'Diferentes importes candidatos; revisión necesaria'};
 return {verified:true,base:possibilities[0].base,vat:possibilities[0].vat,total:gross,
   reason:'Presupuesto '+String(budget)+' concordante con Airtable'};
}
export function prepareOtFields({job,existing=null,price}) {
 const x=job||{},old=existing||{};
 const obj={};
 const put=(dest,src)=>{const v=x[src];if(v!==undefined&&v!==null&&String(v).trim()&&!old[dest])obj[dest]=v;};
 put('Cliente','client');put('Dirección','address');put('Teléfono','phone');
 put('Correo electrónico','email');put('Nº presupuesto','budget');
 put('Fecha instalación','date');put('Trabajos a realizar / partidas','description');
 if(!existing){
   obj['Trabajo origen']=[x.id];obj['Estado parte']='Pendiente de completar';
   obj['Motivo del trabajo']=x.service||'Instalación / servicio';
 }
 if(price?.verified){
   if(old['Base imponible']!=null&&Math.abs(old['Base imponible']-price.base)>.03)return {fields:{},conflict:true,reason:'Base de la OT distinta del presupuesto aceptado'};
   if(old['IVA']!=null&&Math.abs(old['IVA']-price.vat)>.0001)return {fields:{},conflict:true,reason:'IVA de la OT distinto del presupuesto aceptado'};
   obj['Base imponible']=price.base;obj['IVA']=price.vat;
 }
 return {fields:obj,conflict:false,reason:price?.reason||''};
}
