// Panel privado de dirección. Valores derivados, sin editar facturas ni importes financieros.
export const ACTIVE_STATUSES=new Set(['Pendiente de visita','Aceptado / Programado','En progreso']);
const WORK_STATUSES=new Set(['Aceptado / Programado','En progreso','Terminado','Facturado','Pendiente de cobro']);
const FINAL_STATUSES=new Set(['Terminado','Facturado','Pendiente de cobro']);
export function isTestRecord(fields){
  const title=String(fields['Trabajo / referencia']||'');
  const client=String(fields['Nombre del Cliente']||'');
  return /^\s*(?:PRUEBA\b|TEST(?:\s|[-_])|SIMULACI[ÓO]N\b)/i.test(title)||
    /\b(?:CLIENTE FICTICIO|NO FACTURAR|PRUEBA INTERNA ASSA)\b/i.test(title+' '+client);
}
export function buildAdminDashboard(jobs,orders) {
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
    if(['Cancelado','No aceptado / Sin respuesta','Presupuesto pendiente','Presupuesto enviado'].includes(status))continue;
    const linked=ordersByJob.get(j.id)||[];
    const signedOrder=linked.find(o=>o.fields?.['Estado parte']==='Firmado / archivado'&&
      (o.fields?.['Parte firmado']||[]).length);
    const invoiceRef=String(f['Ref. factura']||'').trim();
    const invoiceSent=!!f['Factura enviada (portal)'];
    const paymentConfirmed=!!f['Cobro confirmado (portal)'];
    const total=typeof f['Importe total']==='number'&&f['Importe total']>0?f['Importe total']:null;
    const paid=typeof f['Importe cobrado']==='number'&&f['Importe cobrado']>=0?f['Importe cobrado']:null;
    const paymentState=String(f['Estado cobro']||'');
    const paidInCrm=paymentState==='Cobrado'||(total!==null&&paid!==null&&paid>=total-.01);
    const paymentNeedsReconcile=paymentConfirmed&&!paidInCrm;
    const hasInvoiceEvidence=invoiceSent||!!invoiceRef||['Facturado','Pendiente de cobro'].includes(status);
    const needsInvoice=FINAL_STATUSES.has(status)&&!invoiceSent;
    const noInvoiceEvidence=FINAL_STATUSES.has(status)&&!invoiceSent&&!invoiceRef&&status!=='Facturado';
    const needsSignature=WORK_STATUSES.has(status)&&!signedOrder;
    const needsPayment=hasInvoiceEvidence&&!paymentConfirmed&&!paidInCrm;
    const active=ACTIVE_STATUSES.has(status);
    const anomalies=[
      ...(paymentNeedsReconcile?['Cobro confirmado, importes sin conciliar']:[]),
      ...(invoiceSent&&!invoiceRef?['Envío confirmado sin referencia de factura en Airtable']:[]),
      ...((paymentState==='Cobrado'&&total!==null&&paid!==null&&paid+.01<total)?
        ['Estado cobrado, pero importe recibido inferior al total']:[])
    ];
    rows.push({
      id:j.id,reference:String(f['Trabajo / referencia']||'Trabajo sin referencia'),
      client:String(f['Nombre del Cliente']||'Cliente por completar'),
      address:String(f['Dirección']||''),date:f['Fecha previsto']||f['Fecha prevista']||f['Fecha realizado']||'',
      status,invoiceRef,invoiceSent,paymentConfirmed,paymentState,total,paid,
      invoiceConfirmedAt:f['Fecha confirmación envío factura (portal)']||'',
      paymentConfirmedAt:f['Fecha confirmación cobro (portal)']||'',
      budget:String(f['Nº presupuesto']||''),
      signed:!!signedOrder,otNumber:String(signedOrder?.fields?.['Número de orden']||linked[0]?.fields?.['Número de orden']||''),
      signedPdf:(signedOrder?.fields?.['Parte firmado']||[])[0]?.url||'',
      active,needsSignature,needsInvoice,noInvoiceEvidence,needsPayment,paymentNeedsReconcile,paidInCrm,anomalies,
      needsReview:anomalies.length>0||(FINAL_STATUSES.has(status)&&(needsSignature||needsInvoice||needsPayment))
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
      needsReview:count(r=>r.needsReview)
    },
    rows
  };
}
