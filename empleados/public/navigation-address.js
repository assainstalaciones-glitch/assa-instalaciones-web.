// Dirección destinada exclusivamente a Google Maps. La dirección completa
// de Airtable (piso, puerta, escalera) se mantiene intacta en el expediente.
const interiorStart=/^(?:(?:piso|planta|puerta|porta|pta\.?|escala|escalera|esc\.?|portal|bloque|bloc|bloq\.?|apartamento|apto\.?|àtic|ático|atico|entresuelo|bajo|baixos|principal)\b|\d{1,2}\s*(?:[ºª°]|to\b|ta\b|ro\b|ra\b|er\b|[a-z]$)|\d{1,2}\s*[-/]\s*\d{1,2}\b)/iu;
const inlineInterior=/\s+(?:(?:piso|planta|puerta|porta|pta\.?|escala|escalera|esc\.?|portal|bloque|bloc|bloq\.?|apartamento|apto\.?|àtic|ático|atico|entresuelo|bajo|baixos|principal)\b|\d{1,2}\s*(?:[ºª°]|to\b|ta\b|ro\b|ra\b|er\b))[\s\S]*$/iu;
const towns=['Vinyols i els Arcs','Mont-roig del Camp','Montbrió del Camp','La Selva del Camp','Torredembarra','Vila-seca','Cambrils','Tarragona','Riudoms','Reus','Salou','Mont-roig','Vinyols','Valls','Constantí','L’Ampolla','L\'Ampolla','Amposta','Alcover','Miami Platja'];
const placePattern=new RegExp('(?:^|[\\s,(])(?:\\d{5}\\s+)?('+towns.join('|')+')(?=\\s*(?:[,)]|$))','iu');

export function mapsDestination(fullAddress='',override=''){
 const text=String(override||fullAddress||'').replace(/[\r\n]+/g,', ').replace(/\s+/g,' ').trim().replace(/[;,.\s]+$/,'');
 if(!text)return '';
 const pieces=text.split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean);
 if(!pieces.length)return '';
 let street=pieces[0].replace(inlineInterior,'').trim();
 let next=1;
 // En «Carrer Jaume I, 20, 4º 2ª» el número es el segundo elemento.
 if(pieces[1]&&/^\d{1,4}[A-Za-z]?$/.test(pieces[1])&&!/\b\d{1,4}[A-Za-z]?$/.test(street)){
   street+=' '+pieces[1];next=2;
 }
 const others=pieces.slice(next);
 let town='';
 for(const p of others){
   const match=p.match(placePattern);
   if(match){town=match[1];break;}
 }
 // Si una dirección viene sin comas, la población puede figurar al final.
 if(!town){
   const match=street.match(placePattern);
   if(match && street.toLocaleLowerCase('es').endsWith(match[1].toLocaleLowerCase('es'))){
     town=match[1];street=street.slice(0,-match[1].length).replace(/[\s,]+$/,'');
   }
 }
 // No convertir datos interiores o instrucciones de acceso en municipios.
 if(!town){
   const candidates=others.filter(p=>!interiorStart.test(p)&&!/\b(?:escalera|puerta|piso|planta|portal|bloque|bloc)\b/iu.test(p));
   const last=candidates[candidates.length-1]||'';
   if(/^(?:\d{5}\s+)?[\p{L}][\p{L}'’.\- ]{1,50}$/iu.test(last))
     town=last.replace(/^\d{5}\s+/,'').trim();
 }
 return [street,town].filter(Boolean).join(', ');
}
