export const REL_FIELDS={partnerId:'Colaborador origen (portal)',partnerName:'Colaborador nombre (portal)',partnerRole:'Papel colaborador (portal)',occupant:'Beneficiario / ocupante (portal)',occupantRole:'Relación ocupante (portal)',accessPhone:'Teléfono acceso (portal)',invoiceTo:'Facturar a previsto (portal)'};
export const PARTNER_ROLES=['Intermediario','Contratista'];
export const OCCUPANT_ROLES=['Inquilino','Propietario','Cliente final','Contacto en obra'];
export function relationshipView(fields,admin=false){const result={};for(const [key,field]of Object.entries(REL_FIELDS)){if(key==='invoiceTo'&&!admin)continue;result[key]=['partnerId','invoiceTo'].includes(key)?fields[field]?.[0]||'':fields[field]||'';}return result;}
export function relationshipVersion(job){return JSON.stringify(Object.fromEntries(Object.keys(REL_FIELDS).filter(k=>k!=='partnerName').map(k=>[k,job[k]||''])));}
