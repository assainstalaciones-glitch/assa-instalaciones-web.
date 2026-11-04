import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ASSA_LOGO_JPEG_B64 } from './assa-logo.mjs';

// OT cliente ASSA: formato basado en la plantilla propia v5 de la empresa.
// El inventario consumido y los costes internos NUNCA se imprimen en esta OT.
const W=595.28,H=841.89,X=34,R=561,C=R-X;
const BLACK=rgb(.075,.080,.082),INK=rgb(.16,.18,.19),GRAY=rgb(.40,.43,.44),PALE=rgb(.965,.968,.968),WHITE=rgb(1,1,1),BORDER=rgb(.54,.58,.58);
function clean(value){
  return String(value??'').normalize('NFKC').replace(/[\u2013\u2014]/g,'-')
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/[\u2022\u2023]/g,'-').replace(/\r\n?/g,'\n')
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u20ac\n\r\t]/g,'?').trim();
}
function fmt(n){
  return typeof n==='number'&&Number.isFinite(n)
    ? n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'
    : '-';
}
function fmtDate(value){
  const d=clean(value),m=/^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m?m[3]+'/'+m[2]+'/'+m[1]:d;
}
function lines(value,font,size,width){
  const out=[];for(const paragraph of clean(value).split('\n')){
    if(!paragraph.trim()){out.push('');continue;}
    let row='';
    for(let word of paragraph.trim().split(/\s+/)){
      while(word){
        let chunk=word;
        while(chunk.length>1&&font.widthOfTextAtSize(chunk,size)>width)chunk=chunk.slice(0,-1);
        word=word.slice(chunk.length);
        const candidate=row?row+' '+chunk:chunk;
        if(row&&font.widthOfTextAtSize(candidate,size)>width){out.push(row);row=chunk;}
        else row=candidate;
      }
    }if(row)out.push(row);
  }return out;
}
export async function createSignedWorkPdf({number,job={},report={},signer='',address='',customerNotes='',signedAt,signature=null,receiptHash=''}) {
  const signed=!!signature;
  const pdf=await PDFDocument.create();
  pdf.setTitle(signed?'Parte de trabajo firmado - ASSA Instalaciones':'Orden de trabajo - ASSA Instalaciones');
  pdf.setAuthor('ASSA INSTALACIONES, S.L.');
  pdf.setSubject('Orden de trabajo y conformidad del cliente, vinculada a Airtable');
  const date=new Date(signedAt||Date.now());
  pdf.setCreationDate(Number.isFinite(date.getTime())?date:new Date());
  const normal=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo=await pdf.embedJpg(Buffer.from(ASSA_LOGO_JPEG_B64,'base64'));
  const sigImage=signed?await pdf.embedPng(signature):null;
  let page=pdf.addPage([W,H]);
  const rect=(x,y,w,h,fill=WHITE,border=BORDER,lw=.6)=>{
    page.drawRectangle({x,y,width:w,height:h,color:fill,borderColor:border,borderWidth:lw});
  };
  const str=(value,x,y,size=9,font=normal,color=INK)=>{
    const t=clean(value);if(t)page.drawText(t,{x,y,size,font,color});
  };
  function row(label,value,x,top,w,h,maxLines=2){
    rect(x,top-h,w,h,WHITE,BORDER,.55);
    str(label.toUpperCase(),x+7,top-10,6.7,bold,GRAY);
    const chunks=lines(value||'-',normal,8.6,w-14);
    const limit=Math.min(maxLines,chunks.length);
    for(let i=0;i<limit;i++)str(chunks[i],x+7,top-23-i*10,8.6);
    return chunks.length>maxLines?chunks.slice(maxLines).join(' '):'';
  }
  function bar(title,top){
    rect(X,top-19,C,19,BLACK,BLACK,.7);
    str(title.toUpperCase(),X+8,top-13.3,9.2,bold,WHITE);
  }
  function multiBox(label,value,top,height){
    rect(X,top-height,C,height);
    str(label,X+8,top-12,7,bold,GRAY);
    const chunks=lines(value||'-',normal,9.2,C-16);
    const max=Math.max(1,Math.floor((height-19)/12));
    for(let i=0;i<Math.min(max,chunks.length);i++)str(chunks[i],X+8,top-27-i*12,9.2);
    return chunks.length>max?chunks.slice(max).join('\n'):'';
  }
  function addAnnex(text,clientObservations){
    const blocks=[['TRABAJO REALIZADO / OBSERVACIONES',text],['OBSERVACIONES DEL CLIENTE',clientObservations]].filter(p=>clean(p[1]));
    if(!blocks.length)return;
    page=pdf.addPage([W,H]);let yy=789;
    str('ASSA INSTALACIONES, S.L.  |  ANEXO DE OBSERVACIONES',X,yy,12,bold,BLACK);yy-=18;
    str('Orden: '+clean(number)+'   Cliente: '+clean(job.client),X,yy,9,normal,GRAY);yy-=19;
    for(const [head,body] of blocks){
      bar(head,yy);yy-=34;
      for(const line of lines(body,normal,9.3,C-15)){
        if(yy<65){page=pdf.addPage([W,H]);yy=782;}
        str(line,X+5,yy,9.3);yy-=13;
      }
      yy-=16;
    }
  }

  // Cabecera con el logotipo real de ASSA y datos corporativos actualizados.
  page.drawImage(logo,{x:X+1,y:729,width:96,height:105});
  str('ASSA INSTALACIONES, S.L.',X+105,818,11.6,bold,BLACK);
  str("Carrer d'Andalusia 12 · 43850 Cambrils (Tarragona)",X+105,803,7.8);
  str('NIF B55740500',X+105,789,8);
  str('Tel. 877 21 41 41',X+105,775,8);
  str('assainstalaciones@gmail.com',X+105,761,8);
  str('assainstalaciones.com',X+105,748,8);
  const orderX=428,orderW=133,orderTop=833;
  [['ORDEN',number||'BORRADOR'],['FECHA',fmtDate(report.date||job.date)||'-'],['OPERARIO',report.user||'-']].forEach(([label,value],i)=>{
    const top=orderTop-i*33;
    rect(orderX,top-33,orderW,33,WHITE,BORDER,.9);
    page.drawLine({start:{x:orderX+46,y:top},end:{x:orderX+46,y:top-33},thickness:.65,color:BORDER});
    str(label,orderX+6,top-18,7,bold,GRAY);
    const chunks=lines(value,normal,8.4,orderW-54);
    str(chunks[0]||'-',orderX+51,top-18,8.4,bold,BLACK);
  });
  str('PARTE DE TRABAJO',X+104,727,14.8,bold,BLACK);
  page.drawLine({start:{x:X,y:717},end:{x:R,y:717},color:BLACK,thickness:1.2});
  // Bloques del formato original ASSA.
  bar('USUARIO / CLIENTE',706);
  const clientTop=687;
  row('Nombre',job.client||'-',X,clientTop,245,40,2);
  row('Teléfono',job.phone||'-',X+245,clientTop,130,40,2);
  row('NIF / DNI',job.taxId||'-',X+375,clientTop,C-375,40,2);
  row('Dirección',address||job.address||'-',X,clientTop-40,280,42,2);
  row('Población',job.city||'-',X+280,clientTop-40,104,42,2);
  row('C.P.',job.postal||'-',X+384,clientTop-40,54,42,2);
  row('Correo',job.email||'-',X+438,clientTop-40,C-438,42,2);
  bar('AVISO / DATOS DEL TRABAJO',601);
  const avisoTop=582;
  row('Nº orden',number||'Sin número',X,avisoTop,102,41,2);
  row('Fecha trabajo',fmtDate(report.date||job.date)||'-',X+102,avisoTop,113,41,2);
  row('Presupuesto nº',job.budget||'-',X+215,avisoTop,112,41,2);
  row('Fecha presupuesto',fmtDate(job.budgetDate)||'-',X+327,avisoTop,112,41,2);
  row('Hora cita',job.time||'-',X+439,avisoTop,C-439,41,2);
  const commercial=job.commercial||{};
  const concept=clean(commercial.item||job.reference||'Servicio técnico e instalación');
  const moreConcept=multiBox('MOTIVO / TIPO DE TRABAJO',concept,541,43);
  bar('OBSERVACIONES DE LA INTERVENCIÓN',488);
  const moreObservations=multiBox('TRABAJO REALIZADO Y COMPROBACIONES',report.notes||'Sin observaciones adicionales.',469,52);
  const customerText=clean(customerNotes);
  bar('TRABAJO A REALIZAR / INSTALACIÓN',407);
  const tableY=388,heads=[['CANT.',0,50],['DESCRIPCIÓN / CONCEPTO',50,292],['P. UNIT. SIN IVA',342,100],['IMPORTE',442,C-442]];
  for(const [text,start,width] of heads){
    rect(X+start,tableY-26,width,26,PALE,BORDER,.6);
    str(text,X+start+5,tableY-16,7.1,bold,BLACK);
  }
  const rowTop=tableY-26;
  for(const [start,width] of [[0,50],[50,292],[342,100],[442,C-442]])rect(X+start,rowTop-125,width,125);
  str('1',X+13,rowTop-22,9,bold,BLACK);
  const conceptLines=lines(concept,normal,9.8,279);
  for(let i=0;i<Math.min(conceptLines.length,7);i++)str(conceptLines[i],X+57,rowTop-21-i*12,9.8,i===0?bold:normal,INK);
  const verified=!!commercial.priceVerified;
  const base=verified?commercial.base:null;
  str(base!==null?fmt(base):'A confirmar',X+347,rowTop-23,8.5,normal,INK);
  str(base!==null?fmt(base):'A confirmar',X+447,rowTop-23,8.5,normal,INK);
  if(!verified)str('El importe comercial debe validarse en Airtable antes de firmar una OT con precio.',X+56,rowTop-110,7.1,normal,GRAY);

  // Importe cliente acordado; jamás se confunde con costes reales del técnico.
  const financialTop=229;
  rect(X,financialTop-65,300,65);
  str('FORMA DE PAGO',X+8,financialTop-15,8,bold,BLACK);
  str(clean(job.payment)||'Según condiciones del presupuesto aceptado',X+8,financialTop-34,8.1);
  str('Documento comercial no válido como factura',X+8,financialTop-51,7.6,normal,GRAY);
  const totalX=X+300,totalW=C-300,rowH=65/3;
  [
    ['BASE IMPONIBLE',verified?fmt(commercial.base):'Por confirmar'],
    ['IVA',verified?fmt(commercial.vatAmount):'Por confirmar'],
    ['TOTAL IVA INCL.',verified?fmt(commercial.total):'Por confirmar']
  ].forEach(([l,v],i)=>{
    const top=financialTop-i*rowH;
    rect(totalX,top-rowH,totalW,rowH);
    str(l,totalX+8,top-14.8,8.2,bold,BLACK);
    const width=normal.widthOfTextAtSize(clean(v),8.3);
    str(v,totalX+totalW-7-width,top-14.8,8.3,normal,BLACK);
  });
  bar('CONFORMIDAD DEL CLIENTE',154);
  const sigTop=135;
  rect(X,sigTop-78,C,78);
  str('El firmante reconoce haber recibido el parte de la intervención descrita.',X+8,sigTop-12,7.5);
  str('La firma no sustituye una factura ni limita sus derechos o garantías.',X+8,sigTop-24,7.3,normal,GRAY);
  str('Nombre: '+clean(signer||'Pendiente de firma'),X+8,sigTop-39,8.3);
  const when=signed?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}).format(date):'Pendiente de firma';
  str('Fecha: '+when,X+8,sigTop-55,8);
  const sigX=X+311,sigY=sigTop-73,sigW=207,sigH=69;
  rect(sigX,sigY,sigW,sigH,WHITE,BORDER,.5);
  str('FIRMA CLIENTE',sigX+6,sigY+sigH-11,6.8,bold,GRAY);
  if(sigImage)page.drawImage(sigImage,{x:sigX+7,y:sigY+4,width:sigW-14,height:sigH-19});
  else str('Espacio para firmar',sigX+46,sigY+27,9,normal,GRAY);
  page.drawLine({start:{x:X,y:49},end:{x:R,y:49},thickness:.65,color:BORDER});
  str('DOCUMENTO NO VÁLIDO COMO FACTURA',X,37,7.7,bold,BLACK);
  str('Protección de datos: ASSA INSTALACIONES, S.L. · assainstalaciones@gmail.com',X,25,7.0,normal,GRAY);
  if(receiptHash)str('Ref. verificación: '+clean(receiptHash),X+341,37,6.5,normal,GRAY);
  const annexParts=[];
  if(moreConcept)annexParts.push('MOTIVO / CONCEPTO ADICIONAL:\n'+moreConcept);
  if(moreObservations)annexParts.push('OBSERVACIONES ADICIONALES:\n'+moreObservations);
  if(customerText)annexParts.push('OBSERVACIONES DEL CLIENTE:\n'+customerText);
  if(annexParts.length)addAnnex(annexParts.join('\n\n'),'');
  // El PDF firmado conserva la misma primera página del borrador y añade anexo solo si hace falta.
  return Buffer.from(await pdf.save());
}
