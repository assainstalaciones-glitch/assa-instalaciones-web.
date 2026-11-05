import {REL_FIELDS,PARTNER_ROLES,OCCUPANT_ROLES} from './public/relationships.js';
const invalid=message=>Object.assign(new Error(message),{status:400});
const validId=id=>/^rec[A-Za-z0-9]{14}$/.test(id||'');
export async function prepareRelationships(input,current,{findPartner,findClient}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw invalid('Relaciones del trabajo no válidas.');
 const fields={};
 for(const key of Object.keys(input))if((!Object.hasOwn(REL_FIELDS,key)&&key!=='partnerOther')||key==='partnerName')throw invalid('Campo de relación no permitido.');
 if(Object.hasOwn(input,'partnerOther')&&(typeof input.partnerOther!=='string'||input.partnerOther.length>180))throw invalid('La referencia del colaborador admite hasta 180 caracteres.');
 for(const key of ['occupant','occupantRole','accessPhone'])if(Object.hasOwn(input,key)){
  if(typeof input[key]!=='string'||input[key].length>(key==='accessPhone'?50:250))throw invalid('Revisa el contacto del inmueble.');
  const value=input[key].trim();if(key==='occupantRole'&&value&&!OCCUPANT_ROLES.includes(value))throw invalid('Selecciona la relación del ocupante con el inmueble.');
  if(key==='accessPhone'&&value&&(!/^[+()0-9 .-]{6,50}$/.test(value)||value.replace(/\D/g,'').length<9))throw invalid('Teléfono de acceso inválido.');
  fields[REL_FIELDS[key]]=value||null;
 }
 let partnerId=current[REL_FIELDS.partnerId]?.[0]||'';
 if(Object.hasOwn(input,'partnerId')){
  partnerId=input.partnerId;if(typeof partnerId!=='string'||(partnerId&&partnerId!=='other'&&!validId(partnerId)))throw invalid('Selecciona un colaborador válido.');
  if(!partnerId){fields[REL_FIELDS.partnerId]=[];fields[REL_FIELDS.partnerName]=null;fields[REL_FIELDS.partnerRole]=null;}
  else if(partnerId==='other'){fields[REL_FIELDS.partnerId]=[];fields[REL_FIELDS.partnerName]=input.partnerOther?.trim()?'Otro · '+input.partnerOther.trim()+' (por confirmar)':'Otro colaborador / por confirmar';fields[REL_FIELDS.partnerRole]=null;}
  else{const partner=await findPartner(partnerId);if(!partner?.fields?.Nombre)throw invalid('Colaborador no disponible.');fields[REL_FIELDS.partnerId]=[partnerId];fields[REL_FIELDS.partnerName]=partner.fields.Nombre;fields[REL_FIELDS.partnerRole]=Object.hasOwn(input,'partnerRole')?input.partnerRole:partner.fields['Papel habitual'];}
 }
 if(Object.hasOwn(input,'partnerRole')&&partnerId&&partnerId!=='other')fields[REL_FIELDS.partnerRole]=input.partnerRole;
 if(Object.hasOwn(input,'partnerRole')&&!partnerId&&input.partnerRole)throw invalid('Selecciona primero un colaborador.');
 if(partnerId&&partnerId!=='other'&&Object.hasOwn(fields,REL_FIELDS.partnerRole)&&!PARTNER_ROLES.includes(fields[REL_FIELDS.partnerRole]))throw invalid('Indica si actúa como intermediario o contratista en este encargo.');
 if(Object.hasOwn(input,'invoiceTo')){
  const id=input.invoiceTo;if(typeof id!=='string'||(id&&!validId(id)))throw invalid('Selecciona un destinatario previsto válido.');
  if(id)await findClient(id);fields[REL_FIELDS.invoiceTo]=id?[id]:[];
 }
 // A collaborator's related client is never copied into invoiceTo or the job's original Cliente.
 return Object.fromEntries(Object.entries(fields).filter(([key,value])=>JSON.stringify(current[key]??(Array.isArray(value)?[]:null))!==JSON.stringify(value)));
}
