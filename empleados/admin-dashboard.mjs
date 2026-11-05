// Panel privado de dirección. Resumen operativo; jamás escribir facturas o importes desde este módulo.
import { OUTCOMES, OUTCOME_FIELD } from './public/outcomes.js';
export const ACTIVE_STATUSES=new Set(['Pendiente de visita','Aceptado / Programado','En progreso']);
const WORK_STATUSES=new Set(['Aceptado / Programado','En progreso','Terminado','Facturado','Pendiente de cobro']);
const FINAL_STATUSES=new Set(['Terminado','Facturado','Pendiente de cobro']);

export function isTestRecord(fields){
  const title=String(fields['Trabajo / referencia']||'');
  const client=String(fields['Nombre del Cliente']||'');
  return /^\s*(?:PRUEBA\s+(?:\d+\b|PORTAL\b|INTERNA\b|OT\b|FIRMA\b)|TEST(?:\s|[-_])|SIMULACI[ÓO]N\b)/i.test(title)||
    /\b(?:CLIENTE FICTICIO|PRUEBA INTERNA ASSA)\b/i.test(title+' '+client);
}
export function workNotesEvidence(notes) {
  const n=String(notes||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const free=/(?:no cobro nada|no cobrar|no facturar como ingreso|servicio gratuito|sin cargo para el cliente)/.test(n);
  const explicitlyOpen=/(?:pendiente de cobro|pago pendiente|falta cobrar|resto pendiente|no dar (?:por )?cobrado)/.test(n);
  const reportedPaid=!explicitlyOpen&&/(?:trabajo (?:terminado|realizado) y (?:pagado|cobrado)|revision terminada y pagada|revision (?:terminada|realizada) y cobrada|factura (?:emitida y )?cobrada integramente|trabajo (?:quedo|esta) (?:terminado y )?pagado|trabajo (?:quedo|esta) (?:terminado y )?cobrado|traslado.*trabajo terminado, cobrado|trabajo terminado, cobrado)/.test(n);
  return {free,reportedPaid};
}
export function buildAdminDashboard(jobs,orders,clients=[]) {
  const clientById=new Map(clients.map(c=>[c.id,c.fields||{}]));
  const ordersByJob=new Map();
  for(const order of orders){
    const f=order.fields||{};
    for(const id of f['Trabajo origen']||[]){
      const group=ordersByJob.get(id)||[];
      group.push(order);
      ordersByJob.set(id,group);
    }
  }
  const rows=[];
  let excludedTests=0,unclassified=0;
  for(const j of jobs){
    const f=j.fields||{},status=String(f['Estado']||'');
    if(isTestRecord(f)){excludedTests++;continue;}
    if(!status){unclassified++;continue;}
    const outcome=String(f[OUTCOME_FIELD]||''),outcomeInfo=OUTCOMES.find(o=>o.label===outcome);
    if(['Cancelado','No aceptado / Sin respuesta','Presupuesto pendiente','Presupuesto enviado'].includes(status)&&!outcome)continue;
    const linked=ordersByJob.get(j.id)||[];
    const signedOrder=linked.find(o=>o.fields?.['Estado parte']==='Firmado / archivado'&&
      (o.fields?.['Parte firmado']||[]).length);
    const clientId=Array.isArray(f['Cliente'])?f['Cliente'][0]:null;
    const linkedClient=!!clientId;
    const linkedFields=clientById.get(clientId)||{};
    const clientName=String(f['Nombre del Cliente']||linkedFields['Nombre']||'').trim();
    const addressFromClient=!f['Dirección']&&!!linkedFields['Dirección'];
    const address=String(f['Dirección']||linkedFields['Dirección']||'');
    const invoiceRef=String(f['Ref. factura']||'').trim();
    const invoiceSent=!!f['Factura enviada (portal)'];
    const paymentConfirmed=!!f['Cobro confirmado (portal)'];
    const total=typeof f['Importe total']==='number'&&f['Importe total']>0?f['Importe total']:null;
    const paid=typeof f['Importe cobrado']==='number'&&f['Importe cobrado']>=0?f['Importe cobrado']:null;
    const paymentState=String(f['Estado cobro']||'');
    const paidInCrm=paymentState==='Cobrado'||(total!==null&&paid!==null&&paid>=total-.01);
    const notes=workNotesEvidence(f['Descripción del trabajo']);
    const paidReported=!paidInCrm&&!paymentConfirmed&&notes.reportedPaid;
    const nonBillable=notes.free&&total===null&&!invoiceRef;
    const paymentNeedsReconcile=paymentConfirmed&&!paidInCrm;
    const hasInvoiceEvidence=invoiceSent||!!invoiceRef||['Facturado','Pendiente de cobro'].includes(status);
    const active=ACTIVE_STATUSES.has(status);
    const final=FINAL_STATUSES.has(status);
    // "Sin referencia" != "no existe factura"; "sin checkbox" != "no enviada".
    const noInvoiceEvidence=final&&!invoiceRef&&!invoiceSent&&!nonBillable;
    const needsInvoice=final&&!!invoiceRef&&!invoiceSent&&!paidInCrm&&!paymentConfirmed&&!paidReported;
    // Una OT anterior al portal puede carecer de firma digital sin convertir un
    // trabajo cobrado en una incidencia administrativa nueva.
    const hasArchivedUnsignedOt=FINAL_STATUSES.has(status)&&linked.length>0&&!signedOrder;
    const needsSignature=ACTIVE_STATUSES.has(status)&&linked.length>0&&!signedOrder;
    const needsPayment=hasInvoiceEvidence&&!paymentConfirmed&&!paidInCrm&&!paidReported&&!nonBillable;
    const missingData=[
      ...(!clientName?['Nombre del cliente']:[]),
      ...(!linkedClient?['Ficha de cliente sin vincular']:[]),
      ...(final&&!invoiceRef&&!nonBillable?['Referencia de factura sin vincular']:[])
    ];
    const dataIncomplete=missingData.length>0;
    const closed=final&&paidInCrm&&!!invoiceRef&&!dataIncomplete;
    const anomalies=[
      ...(paymentNeedsReconcile?['Cobro marcado manualmente, pero importes sin conciliar']:[]),
      ...((paymentState==='Cobrado'&&total!==null&&paid!==null&&paid+.01<total)?
        ['Estado cobrado, pero importe recibido inferior al total']:[])
    ];
    rows.push({
      id:j.id,reference:String(f['Trabajo / referencia']||'Trabajo sin referencia'),
      client:clientName||'Cliente por completar',
      address,addressFromClient,date:f['Fecha prevista']||f['Fecha realizado']||'',
      status,outcome,closedWithoutWork:!!outcomeInfo?.closed&&outcomeInfo.code!=='completed',operationallyClosed:final||!!outcomeInfo?.closed,invoiceRef,invoiceSent,paymentConfirmed,paymentState,total,paid,
      invoiceConfirmedAt:f['Fecha confirmación envío factura (portal)']||'',
      paymentConfirmedAt:f['Fecha confirmación cobro (portal)']||'',
      budget:String(f['Nº presupuesto']||''),
      signed:!!signedOrder,hasOt:linked.length>0,hasArchivedUnsignedOt,closed,
      otNumber:String(signedOrder?.fields?.['Número de orden']||linked[0]?.fields?.['Número de orden']||''),
      signedPdf:(signedOrder?.fields?.['Parte firmado']||[])[0]?.url||'',
      active,needsSignature,needsInvoice,noInvoiceEvidence,needsPayment,
      paymentNeedsReconcile,paidInCrm,paidReported,nonBillable,dataIncomplete,missingData,anomalies,
      needsReview:anomalies.length>0||needsInvoice||needsPayment||(active&&needsSignature)||
        (active&&!clientName)||(noInvoiceEvidence&&!paidInCrm&&!paidReported)
    });
  }
  const recent=(a,b)=>String(b.date||'').localeCompare(String(a.date||''))||a.reference.localeCompare(b.reference);
  rows.sort((a,b)=>Number(b.active)-Number(a.active)||Number(b.needsReview)-Number(a.needsReview)||recent(a,b));
  const count=predicate=>rows.filter(predicate).length;
  return {
    generatedAt:new Date().toISOString(),
    scope:{totalInAirtable:jobs.length,excludedTests,unclassified,operational:rows.length},
    counts:{
      active:count(r=>r.active),
      unsigned:count(r=>r.needsSignature),
      invoiceUnconfirmed:count(r=>r.needsInvoice),
      missingInvoice:count(r=>r.noInvoiceEvidence),
      paymentPending:count(r=>r.needsPayment),
      reconciliation:count(r=>r.paymentNeedsReconcile),
      incomplete:count(r=>r.dataIncomplete),
      closed:count(r=>r.closed),
      closedWithoutWork:count(r=>r.closedWithoutWork),
      notesPaid:count(r=>r.paidReported),
      needsReview:count(r=>r.needsReview)
    },
    rows
  };
}
