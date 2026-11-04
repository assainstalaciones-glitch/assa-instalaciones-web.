import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// OT corporativa ASSA: datos confirmados de Airtable, sin costes internos ni facturación.
const W=595.28,H=841.89,LEFT=43,RIGHT=552,WIDTH=RIGHT-LEFT;
const C={
  navy:rgb(.075,.145,.226),dark:rgb(.090,.18,.23),green:rgb(.075,.44,.38),
  mint:rgb(.78,.94,.88),paper:rgb(.954,.972,.972),line:rgb(.83,.88,.89),
  grey:rgb(.39,.46,.49),white:rgb(1,1,1),amber:rgb(.98,.89,.66)
};
function clean(value){
  return String(value??'').normalize('NFKC')
    .replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201c\u201d]/g,'"').replace(/[\u2022\u2023]/g,'-')
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u20ac\n\r\t]/g,'?')
    .replace(/\r\n?/g,'\n').trim();
}
function lines(value,font,size,maxWidth){
  const out=[];
  for(const para of clean(value).split('\n')){
    if(!para.trim()){out.push('');continue;}
    let current='';
    for(const word of para.trim().split(/\s+/)){
      const pieces=[];
      let pending=word;
      while(pending){
        let segment=pending;
        while(segment.length>1&&font.widthOfTextAtSize(segment,size)>maxWidth)segment=segment.slice(0,-1);
        pieces.push(segment);pending=pending.slice(segment.length);
      }
      for(const part of pieces){
        const candidate=current?current+' '+part:part;
        if(current&&font.widthOfTextAtSize(candidate,size)>maxWidth){out.push(current);current=part;}
        else current=candidate;
      }
    }
    if(current)out.push(current);
  }
  return out;
}
function displayDate(date){
  if(!date)return '';
  const raw=clean(date);
  const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match?match[3]+'/'+match[2]+'/'+match[1]:raw;
}
function customerFacing(text){
  return clean(text).split('\n').map(row=>
    row.replace(/\bPresupuesto\s+(?:ASSA[-\s]?\d+|n[ºo.]\s*\d+|de\s+\d+).*$/i,'').trim()
  ).filter(row=>row&&!/^(?:precio|margen|beneficio|coste interno|importe total|importe presupuestado)\b/i.test(row))
   .join('\n').trim();
}
export async function createSignedWorkPdf({number,job={},report={},signer='',address='',customerNotes='',signedAt,signature=null,receiptHash=''}) {
  const signed=!!signature;
  const date=signedAt?new Date(signedAt):new Date();
  const pdf=await PDFDocument.create();
  pdf.setTitle(signed?'Parte de trabajo firmado - ASSA Instalaciones':'Orden de trabajo - ASSA Instalaciones');
  pdf.setAuthor('ASSA Instalaciones');
  pdf.setSubject('Orden de trabajo ASSA - intervención y recepción del cliente');
  pdf.setCreationDate(Number.isFinite(date.getTime())?date:new Date());
  const normal=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const signatureImage=signed?await pdf.embedPng(signature):null;
  let page,y;
  function paintPage(){
    page=pdf.addPage([W,H]);y=737;
    page.drawRectangle({x:0,y:774,width:W,height:H-774,color:C.navy});
    page.drawRectangle({x:0,y:774,width:7,height:H-774,color:C.green});
    page.drawText('ASSA',{x:LEFT,y:798,size:29,font:bold,color:C.white});
    page.drawText('INSTALACIONES',{x:144,y:806,size:11,font:bold,color:C.mint});
    page.drawText('ORDEN DE TRABAJO',{x:404,y:812,size:10.2,font:bold,color:C.white});
    page.drawText('Carrer d\'Andalusia 12  ·  43850 Cambrils  ·  Tel. 877 21 41 41',{x:LEFT,y:758,size:8.8,font:normal,color:C.grey});
    page.drawLine({start:{x:LEFT,y:748},end:{x:RIGHT,y:748},color:C.line,thickness:.8});
  }
  function need(height){if(y-height<63)paintPage();}
  function textBlock(value,opts={}){
    const text=clean(value)||clean(opts.fallback||'');
    if(!text)return;
    const size=opts.size||9.5,step=opts.step||13,offset=opts.x||LEFT,limit=opts.maxWidth||WIDTH,font=opts.bold?bold:normal,color=opts.color||C.dark;
    const chunks=lines(text,font,size,limit);
    for(const chunk of chunks){
      need(step+2);
      if(chunk)page.drawText(chunk,{x:offset,y,size,font,color});
      y-=step;
    }
  }
  function section(title){
    need(37);y-=11;
    page.drawRectangle({x:LEFT,y:y-6,width:3,height:20,color:C.green});
    page.drawText(clean(title).toUpperCase(),{x:LEFT+12,y,size:10.2,font:bold,color:C.green});
    y-=25;
  }
  function infoCell(label,value,x,top,maxWidth){
    page.drawText(clean(label).toUpperCase(),{x:x+10,y:top-13,size:7.5,font:bold,color:C.grey});
    const options=lines(value||'-',normal,9.2,maxWidth-20);
    options.slice(0,3).forEach((t,i)=>{if(t)page.drawText(t,{x:x+10,y:top-27-i*11,size:9.2,font:normal,color:C.dark});});
  }
  function infoRow(leftLabel,leftValue,rightLabel,rightValue){
    const column=WIDTH/2;
    const la=lines(leftValue||'-',normal,9.2,column-23);
    const ra=lines(rightValue||'-',normal,9.2,column-23);
    const rowHeight=Math.max(39,26+Math.max(la.length,ra.length,1)*11);
    need(rowHeight+3);
    const top=y;
    page.drawRectangle({x:LEFT,y:top-rowHeight,width:WIDTH,height:rowHeight,color:C.paper,borderColor:C.line,borderWidth:.6});
    page.drawLine({start:{x:LEFT+column,y:top},end:{x:LEFT+column,y:top-rowHeight},color:C.line,thickness:.6});
    infoCell(leftLabel,leftValue,LEFT,top,column);
    infoCell(rightLabel,rightValue,LEFT+column,top,column);
    y-=rowHeight;
  }
  function materialsTable(value){
    const rows=clean(value).split('\n').map(x=>x.trim()).filter(Boolean);
    const entries=rows.length?rows:['Sin materiales registrados'];
    function heading(){
      need(26);page.drawRectangle({x:LEFT,y:y-24,width:WIDTH,height:24,color:C.paper});
      page.drawText('CANTIDAD',{x:LEFT+9,y:y-16,size:8.3,font:bold,color:C.green});
      page.drawText('MATERIAL / DESCRIPCIÓN',{x:LEFT+111,y:y-16,size:8.3,font:bold,color:C.green});
      y-=24;
    }
    heading();
    for(const [i,line] of entries.entries()){
      const m=/^(\d+(?:[.,]\d+)?)\s+(.+)/.exec(line);
      const qty=m?m[1]:'-';
      const desc=m?m[2]:line;
      const wrapped=lines(desc,normal,9.15,WIDTH-124);
      const height=Math.max(22,wrapped.length*12+10);
      if(y-height<73){paintPage();heading();}
      page.drawRectangle({x:LEFT,y:y-height,width:WIDTH,height,
        color:i%2?C.paper:C.white,borderColor:C.line,borderWidth:.4});
      page.drawLine({start:{x:LEFT+99,y},end:{x:LEFT+99,y:y-height},color:C.line,thickness:.5});
      page.drawText(clean(qty),{x:LEFT+11,y:y-15,size:9.2,font:normal,color:C.dark});
      wrapped.forEach((t,j)=>{if(t)page.drawText(t,{x:LEFT+111,y:y-15-j*12,size:9.15,font:normal,color:C.dark});});
      y-=height;
    }
    y-=3;
  }
  function signingPanel(){
    need(183);
    section('Recepción y conformidad del cliente');
    textBlock('La firma acredita la recepción de este parte y la intervención descrita. No sustituye una factura ni limita garantías o derechos del cliente.',
      {size:8.5,step:11,color:C.grey});
    need(137);y-=8;
    const panelTop=y;
    page.drawRectangle({x:LEFT,y:panelTop-119,width:WIDTH,height:119,color:C.paper,borderColor:C.line,borderWidth:.7});
    page.drawText('PERSONA QUE FIRMA',{x:LEFT+11,y:panelTop-15,size:7.5,font:bold,color:C.grey});
    page.drawText(clean(signer)||'Pendiente de firma',{x:LEFT+11,y:panelTop-31,size:9.4,font:normal,color:C.dark});
    page.drawText('FECHA / HORA',{x:LEFT+11,y:panelTop-53,size:7.5,font:bold,color:C.grey});
    const timestamp=signed?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}).format(date):'Pendiente';
    page.drawText(timestamp,{x:LEFT+11,y:panelTop-68,size:9.2,font:normal,color:C.dark});
    const sigX=LEFT+239,sigY=panelTop-107,sigW=259,sigH=95;
    page.drawRectangle({x:sigX,y:sigY,width:sigW,height:sigH,color:C.white,borderColor:C.line,borderWidth:.7});
    page.drawText('FIRMA DEL CLIENTE',{x:sigX+10,y:sigY+sigH-13,size:7.5,font:bold,color:C.grey});
    if(signatureImage)page.drawImage(signatureImage,{x:sigX+9,y:sigY+5,width:sigW-18,height:sigH-21});
    else page.drawText('Espacio para firmar',{x:sigX+74,y:sigY+34,size:9,font:normal,color:C.grey});
    y-=127;
  }

  paintPage();
  page.drawText('PARTE DE INTERVENCIÓN',{x:LEFT,y:721,size:16,font:bold,color:C.navy});
  const status=signed?'FIRMADO / ARCHIVADO':'VISTA PREVIA · SIN FIRMAR';
  const statusWidth=bold.widthOfTextAtSize(status,8.2)+20;
  page.drawRectangle({x:RIGHT-statusWidth,y:714,width:statusWidth,height:22,
    color:signed?C.mint:C.amber});
  page.drawText(status,{x:RIGHT-statusWidth+10,y:722,size:8.2,font:bold,color:C.navy});
  y=704;
  const ref=clean(number)||'BORRADOR SIN NUMERAR';
  const workDate=displayDate(report.date||job.date)||'-';
  infoRow('Número de OT',ref,'Fecha de intervención',workDate);
  infoRow('Cliente',job.client||'-','Teléfono',job.phone||'-');
  infoRow('Dirección de la intervención',address||job.address||'-','Población / C.P.',[job.postal,job.city].filter(Boolean).join(' ')||'-');
  infoRow('Técnico / operario',report.user||'-','Presupuesto / referencia',job.budget||job.reference||'-');
  if(job.service||job.time)infoRow('Servicio',job.service||'-','Hora prevista',job.time||'-');
  if(job.email||job.taxId)infoRow('Correo del cliente',job.email||'-','NIF / DNI',job.taxId||'-');

  y-=6;
  section('Trabajo solicitado');
  textBlock(customerFacing(job.description)||'Intervención técnica de ASSA Instalaciones.',{fallback:'Intervención técnica'});
  section('Trabajo realizado y comprobaciones');
  textBlock(report.notes||'Pendiente de completar por el operario.');
  section('Material utilizado');
  materialsTable(report.material||'');
  if(customerNotes){
    section('Observaciones del cliente');
    textBlock(customerNotes,{size:9.4});
  }
  signingPanel();
  if(receiptHash){
    need(20);
    textBlock('Referencia de verificación: '+receiptHash,{size:8,step:11,color:C.grey});
  }
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:LEFT,y:45},end:{x:RIGHT,y:45},color:C.line,thickness:.65});
    p.drawText('ASSA INSTALACIONES  ·  Cambrils  ·  877 21 41 41',{x:LEFT,y:31,size:8,font:bold,color:C.grey});
    p.drawText('Pág. '+(i+1)+' / '+pages.length,{x:RIGHT-40,y:31,size:8,font:normal,color:C.grey});
  });
  return Buffer.from(await pdf.save());
}
