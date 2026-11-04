// Read-only projection of Airtable's documentary reconciliation pilot.
// No financial fields, client files, or invoices are ever modified here.
export function buildReconciliationView({proposals=[],documents=[],jobs=[],clients=[]}={}){
  const field=(r,n)=>r?.fields?.[n];
  const linkedId=(r,n)=>(field(r,n)||[])[0];
  const docsById=new Map(documents.map(d=>[d.id,d]));
  const jobsById=new Map(jobs.map(j=>[j.id,j]));
  const clientsById=new Map(clients.map(c=>[c.id,c]));
  const safeDriveLink=x=>{
    const match=/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/view(?:\?.*)?$/.exec(String(x||''));
    return match?'https://drive.google.com/file/d/'+match[1]+'/view':'';
  };
  const rows=proposals.map(p=>{
    const invoiceDoc=docsById.get(linkedId(p,'Documento verificado'));
    const work=jobsById.get(linkedId(p,'Trabajo'));
    const client=clientsById.get(linkedId(p,'Cliente'));
    const invoice=field(p,'Número factura')||field(invoiceDoc,'Número factura')||'';
    const total=field(p,'Importe factura');
    const result=field(p,'Resultado')||'Propuesta para revisar';
    const fileKey=field(invoiceDoc,'Clave documento')||field(p,'Documento')||'';
    const docUrl=safeDriveLink(field(invoiceDoc,'Enlace original')||field(p,'Documento URL'));
    return {
      id:p.id,invoice:String(invoice),workId:work?.id||'',
      work:String(field(work,'Trabajo / referencia')||'Trabajo sin identificar'),
      client:String(field(client,'Nombre')||field(work,'Nombre del Cliente')||'Cliente sin vincular'),
      fiscalClient:String(field(invoiceDoc,'Cliente fiscal')||''),
      amount:typeof total==='number'?total:null,
      result:String(result),reviewType:String(field(p,'Tipo revisión')||''),
      why:String(field(p,'Motivos')||''),
      delivery:String(field(p,'Estado envío')||'Sin evidencia de envío'),
      payment:String(field(p,'Estado cobro documental')||'Sin datos suficientes'),
      url:docUrl,fileName:String(field(invoiceDoc,'Nombre original')||''),
      fileKey,source:String(field(invoiceDoc,'Origen')||''),
      duplicateCopy:field(invoiceDoc,'Estado documental')==='Copia de otra factura',
      reviewRequired:result!=='Coincidencia documental'&&result!=='Aplicado'
    };
  });
  rows.sort((a,b)=>Number(b.reviewRequired)-Number(a.reviewRequired)||a.invoice.localeCompare(b.invoice));
  return {pilot:true,access:'admin-read-only',counts:{
    proposals:rows.length,documentFiles:documents.length,
    documentaryMatches:rows.filter(x=>x.result==='Coincidencia documental').length,
    reviewNeeded:rows.filter(x=>x.reviewRequired).length,
    duplicateFiles:documents.filter(x=>x.fields?.['Estado documental']==='Copia de otra factura').length,
    bankVerified:rows.filter(x=>x.payment==='Justificante contrastado').length
  },rows};
}
