// Texto y cifras comerciales de la OT: únicamente valores confirmados en Airtable.
const finitePositive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
function parseEsAmount(text){
  const x=String(text).trim().replace(/\s/g,'');
  if(!x)return null;
  const digits=x.includes(',')?x.replace(/\./g,'').replace(',','.'):x;
  const n=Number(digits);
  return Number.isFinite(n)&&n>0?n:null;
}
function confirmedQuoteInText(description){
  const text=String(description||'');
  const parts=[...text.matchAll(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*€\s*\+\s*IVA\b/gi)];
  return parts.length===1?parseEsAmount(parts[0][1]):null;
}
function pickConcept({description='',orderTitle='',workName=''}) {
  const all=[orderTitle,workName,description].join(' ');
  if(/warmhaus\s+enerwa[\s-]*(?:24[\/-](?:31|32)|\d+[\/-]\d+)/i.test(all)){
    const m=all.match(/warmhaus\s+enerwa[\s-]*(\d+[\/-]\d+)/i);
    return 'Caldera Warmhaus Enerwa '+(m?m[1].replace('-','/'):'');
  }
  if(/mitsubishi/i.test(all)){
    const m=all.match(/MSZ[-\s]?HR\d+[A-Z0-9-]*/i);
    return 'Aire acondicionado Mitsubishi Electric'+(m?' '+m[0]:'');
  }
  if(/termo\s+el[eé]ctrico/i.test(all)){
    const m=all.match(/(\d{2,3})\s*(?:litros|l\b)/i);
    return 'Sustitución de termo eléctrico'+(m?' '+m[1]+' L':'');
  }
  if(/termostato\s+(?:digital\s+)?(?:control\s+calor\s+)?ORKLI/i.test(all))return 'Sustitución de termostato ORKLI';
  const title=String(orderTitle||'').trim();
  const generic=/^(gas|fontaner[ií]a|electricidad|climatizaci[oó]n|calderas|otros|visita|suministro)$/i;
  if(title.length>8&&title.length<=150&&!generic.test(title)&&!/(COSTES|RENTABILIDAD|INTERNAL|SIMULACI[ÓO]N SIN)/i.test(title))
    return title.replace(/\bPresupuesto\s+ASSA-[^\s]+.*$/i,'').trim().slice(0,115);
  let ref=String(workName||'').trim();
  if(ref.includes(' · '))ref=ref.split(' · ').slice(1).join(' · ');
  else if(ref.includes(' - '))ref=ref.split(' - ').slice(1).join(' - ');
  return ref.slice(0,115)||'Servicio técnico e instalación';
}
export function buildCommercialOT({
  description='',orderTitle='',workName='',orderBase,orderVat,orderTotal,
  jobTotal,jobBudget='',status=''
}={}){
  const item=pickConcept({description,orderTitle,workName});
  let base=finitePositive(orderBase),total=finitePositive(orderTotal);
  let rate=null,source='';
  if(base){
    if(typeof orderVat==='number'&&Number.isFinite(orderVat)&&orderVat>=0&&orderVat<=1){
      rate=orderVat;
      const computed=Math.round(base*(1+rate)*100)/100;
      if(total&&Math.abs(total-computed)>0.08)total=null;
      total=total||computed;
      source='Base e IVA de la OT de Airtable';
    }else if(total&&total>base){
      const ratio=total/base-1;
      for(const vat of [.21,.10,.04])if(Math.abs(ratio-vat)<.0005){rate=vat;source='Base y total de la OT de Airtable';break;}
      if(rate===null)total=null;
    }else{
      total=null;source='Base registrada en OT, IVA pendiente de confirmar';
    }
  }else{
    const raw=confirmedQuoteInText(description);
    const totalStored=finitePositive(jobTotal);
    const accepted=/Aceptado|En progreso|Terminado|Facturado|Cobrado/i.test(String(status));
    if(raw&&totalStored&&accepted&&jobBudget){
      for(const vat of [.21,.10,.04]){
        if(Math.abs(Math.round(raw*(1+vat)*100)/100-totalStored)<=0.06){
          base=raw;rate=vat;total=totalStored;
          source='Presupuesto aceptado y total coincidente en Airtable';
          break;
        }
      }
    }
  }
  return {
    item,
    base:base?Math.round(base*100)/100:null,
    vatRate:rate,
    vatAmount:rate!==null&&base?Math.round(base*rate*100)/100:null,
    total:total?Math.round(total*100)/100:null,
    source:source||'Importe no validado en Airtable',
    priceVerified:!!(base&&rate!==null&&total)
  };
}
