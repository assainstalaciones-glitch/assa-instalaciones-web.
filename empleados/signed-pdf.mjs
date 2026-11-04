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
  pdf.setTitle('Parte de trabajo firmado - ASSA Instalaciones');
  pdf.setAuthor('ASSA Instalaciones');
  pdf.setSubject('Recepción de trabajos y firma manuscrita en pantalla');
  pdf.setCreationDate(new Date(signedAt));
  const normal=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const png=await pdf.embedPng(signature);
  let page,y;
  function newPage(){
    page=pdf.addPage([595.28,841.89]);y=736;
    page.drawRectangle({x:0,y:780,width:595.28,height:61,color:NAVY});
    page.drawText('ASSA',{x:43,y:800,size:23,font:bold,color:WHITE});
    page.drawText('INSTALACIONES',{x:126,y:803,size:12,font:bold,color:rgb(.44,.88,.77)});
    page.drawText('Carrer d\'Andalusia 12 · Cambrils · 877 21 41 41',{x:43,y:763,size:9,font:normal,color:GREY});
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
  newPage();
  page.drawText('PARTE DE TRABAJO FIRMADO',{x:44,y,size:19,font:bold,color:NAVY});y-=34;
  line('Nº de parte',number||'Parte vinculado al trabajo');
  line('Trabajo',job.reference||job.id);
  line('Cliente',job.client||'Cliente');
  line('Dirección',address||job.address||'No indicada');
  line('Técnico',report.user||'Operario ASSA');
  line('Fecha de intervención',report.date||'No indicada');
  line('Horas registradas',report.hours===0?'0':String(report.hours??'No indicadas'));
  heading('Trabajo solicitado');
  paragraph(job.description||'Intervención técnica de ASSA Instalaciones.');
  heading('Trabajos realizados y observaciones del técnico');
  paragraph(report.notes||'Sin observaciones adicionales.');
  heading('Material utilizado');
  paragraph(report.material||'Sin material detallado.');
  if(customerNotes){
    heading('Observaciones del cliente');
    paragraph(customerNotes);
  }
  heading('Recepción del trabajo');
  paragraph('La persona firmante confirma que se le ha mostrado este parte y que reconoce la realización de la intervención descrita. Su firma no sustituye una factura ni limita las garantías o derechos que correspondan.',{size:9.4,leading:14});
  space(175);
  line('Nombre de quien firma',signer);
  line('Fecha y hora de firma',signedAt);
  page.drawRectangle({x:43,y:y-116,width:350,height:112,borderColor:rgb(.77,.84,.86),borderWidth:1,color:WHITE});
  page.drawImage(png,{x:51,y:y-108,width:333,height:94});
  y-=133;
  if(receiptHash)paragraph('Referencia de registro: '+receiptHash,{size:8.5,leading:12,color:GREY});
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:43,y:49},end:{x:552,y:49},color:rgb(.84,.88,.9),thickness:.8});
    p.drawText('ASSA Instalaciones  |  Documento de recepción con firma en pantalla',{x:43,y:35,size:8,font:normal,color:GREY});
    p.drawText(String(i+1)+' / '+pages.length,{x:518,y:35,size:8,font:normal,color:GREY});
  });
  return Buffer.from(await pdf.save());
}
