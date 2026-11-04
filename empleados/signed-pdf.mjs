import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const NAVY=rgb(.071,.145,.235),TEAL=rgb(.03,.49,.42),GREY=rgb(.37,.43,.49),WHITE=rgb(1,1,1);
function safe(value){
  return String(value??'').normalize('NFKC')
    .replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201c\u201d]/g,'"').replace(/\u2022/g,'-')
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u20ac\n\r\t]/g,'?').trim();
}
function linesFor(value,font,size,maxWidth){
  const out=[];
  for(const paragraph of safe(value).split(/\r?\n/)){
    if(!paragraph.trim()){out.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)){
      let rest=word;
      while(rest){
        let part=rest;
        while(part.length>1&&font.widthOfTextAtSize(part,size)>maxWidth)part=part.slice(0,-1);
        rest=rest.slice(part.length);
        const trial=line?line+' '+part:part;
        if(line&&font.widthOfTextAtSize(trial,size)>maxWidth){out.push(line);line=part;}
        else line=trial;
      }
    }
    if(line)out.push(line);
  }
  return out;
}
export async function createSignedWorkPdf({number,job,report,signer,address,customerNotes,signedAt,signature,receiptHash}){
  const pdf=await PDFDocument.create();
  pdf.setTitle(signature?'Parte de trabajo firmado - ASSA Instalaciones':'Orden de trabajo - ASSA Instalaciones');
  pdf.setAuthor('ASSA Instalaciones');
  pdf.setSubject('Recepción de trabajos y firma manuscrita en pantalla');
  pdf.setCreationDate(new Date(signedAt));
  const normal=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const png=signature?await pdf.embedPng(signature):null;
  let page,y;
  function newPage(){
    page=pdf.addPage([595.28,841.89]);y=734;
    page.drawRectangle({x:0,y:780,width:595.28,height:61,color:NAVY});
    page.drawText('ASSA',{x:43,y:802,size:24,font:bold,color:WHITE});
    page.drawText('INSTALACIONES',{x:130,y:805,size:11,font:bold,color:rgb(.44,.88,.77)});
    page.drawText('ORDEN DE TRABAJO',{x:398,y:805,size:11,font:bold,color:WHITE});
    page.drawText('Carrer d\'Andalusia 12 · Cambrils · Tel. 877 21 41 41',{x:43,y:763,size:9,font:normal,color:GREY});
  }
  function space(amount=18){if(y-amount<65)newPage();}
  function heading(text){space(38);y-=9;page.drawText(safe(text).toUpperCase(),{x:43,y,size:11,font:bold,color:TEAL});y-=17;}
  function paragraph(value,opts={}){
    const size=opts.size||10.3,leading=opts.leading||15.4,color=opts.color||NAVY;
    for(const line of linesFor(value,normal,size,504)){
      space(leading+4);
      if(line)page.drawText(line,{x:44,y,size,font:normal,color});
      y-=leading;
    }
    y-=5;
  }
  function line(label,value){
    const text=safe(value)||'No indicado';
    const prefix=safe(label)+': ';
    space(22);
    page.drawText(prefix,{x:44,y,size:10,font:bold,color:NAVY});
    const x=44+bold.widthOfTextAtSize(prefix,10);
    const remainder=linesFor(text,normal,10,548-x);
    if(remainder.length){
      page.drawText(remainder[0],{x,y,size:10,font:normal,color:NAVY});y-=16;
      for(const continuation of remainder.slice(1)){space(19);page.drawText(continuation,{x:44,y,size:10,font:normal,color:NAVY});y-=16;}
    }else y-=16;
  }
  function materialsTable(value){
    const items=String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const rows=items.length?items:['Sin materiales registrados'];
    function header(){
      space(30);
      page.drawRectangle({x:43,y:y-24,width:509,height:25,color:rgb(.91,.96,.95)});
      page.drawText('CANT.',{x:52,y:y-16,size:9,font:bold,color:NAVY});
      page.drawText('MATERIAL / DESCRIPCIÓN',{x:129,y:y-16,size:9,font:bold,color:NAVY});
      y-=26;
    }
    header();
    for(const raw of rows){
      // Conservar literalmente las cantidades anotadas por el operario; sin precios ni costes.
      const match=/^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(raw);
      const qty=match?match[1]:'—';
      const description=match?match[2]:raw;
      const wrapped=linesFor(description,normal,9.4,409);
      const rowHeight=Math.max(24,wrapped.length*13+9);
      if(y-rowHeight<80){newPage();header();}
      page.drawRectangle({x:43,y:y-rowHeight,width:509,height:rowHeight,borderColor:rgb(.85,.89,.90),borderWidth:.5,color:WHITE});
      page.drawLine({start:{x:117,y},end:{x:117,y:y-rowHeight},color:rgb(.85,.89,.90),thickness:.6});
      page.drawText(safe(qty),{x:52,y:y-15,size:9.4,font:normal,color:NAVY});
      wrapped.forEach((line,i)=>{if(line)page.drawText(line,{x:129,y:y-15-i*13,size:9.4,font:normal,color:NAVY});});
      y-=rowHeight;
    }
    y-=12;
  }
  newPage();
  page.drawText(signature?'PARTE DE TRABAJO FIRMADO':'OT - VISTA PREVIA PARA EL CLIENTE',{x:44,y,size:16,font:bold,color:NAVY});y-=32;
  page.drawRectangle({x:43,y:y-5,width:509,height:1,color:rgb(.83,.88,.90)});y-=17;
  line('Nº OT',number||'Pendiente de numeración al firmar');
  line('Referencia trabajo',job.reference||job.id);
  line('Cliente',job.client||'Cliente');
  line('Dirección',address||job.address||'No indicada');
  line('Técnico',report.user||'Operario ASSA');
  line('Fecha intervención',report.date||'No indicada');
  line('Horas registradas',report.hours===0?'0':String(report.hours??'No indicadas'));
  heading('Trabajo solicitado / motivo');
  paragraph(job.description||'Intervención técnica de ASSA Instalaciones.');
  heading('Trabajos realizados');
  paragraph(report.notes||'Pendiente de detallar por el instalador.');
  heading('Relación de materiales utilizados');
  materialsTable(report.material);
  if(customerNotes){
    heading('Observaciones del cliente');
    paragraph(customerNotes);
  }
  heading('Observaciones y conformidad del cliente');
  paragraph('Se ha mostrado al cliente la orden de trabajo y los trabajos descritos. La firma acredita la recepción del parte; no sustituye la factura ni limita derechos o garantías.',{size:9.2,leading:13});
  space(198);
  line('Nombre del firmante',signer||'Pendiente de firma');
  line('Fecha y hora',png?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}).format(new Date(signedAt)):'Pendiente de firma');
  page.drawText('CONFORMIDAD / FIRMA DEL CLIENTE',{x:44,y:y-4,size:9,font:bold,color:TEAL});
  y-=13;
  page.drawRectangle({x:43,y:y-110,width:350,height:106,borderColor:rgb(.77,.84,.86),borderWidth:1,color:WHITE});
  if(png)page.drawImage(png,{x:50,y:y-104,width:334,height:92});
  else page.drawText('Espacio para la firma del cliente',{x:66,y:y-56,size:10,font:normal,color:GREY});
  y-=127;
  if(receiptHash)paragraph('Referencia de registro: '+receiptHash,{size:8.2,leading:12,color:GREY});
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:43,y:49},end:{x:552,y:49},color:rgb(.84,.88,.9),thickness:.8});
    p.drawText('ASSA Instalaciones  |  Parte de trabajo / Orden de trabajo',{x:43,y:35,size:8,font:normal,color:GREY});
    p.drawText(String(i+1)+' / '+pages.length,{x:518,y:35,size:8,font:normal,color:GREY});
  });
  return Buffer.from(await pdf.save());
}
