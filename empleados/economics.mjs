// Read existing Airtable evidence only; never infer missing costs or write money.
export const ECONOMIC_FIELDS=['Estado económico validado','Portal · Horas cerradas automáticas','Portal · MO provisional automática (20 €/h)','Portal · Revisión de costes pendiente','Horas reales verificadas (operario-h)','Margen analítico tras mano de obra','Evidencia y pendientes económicos'];
export function economicsView(fields){
 const number=key=>typeof fields[key]==='number'&&Number.isFinite(fields[key])?fields[key]:null;
 const status=String(fields[ECONOMIC_FIELDS[0]]||'Sin validar');
 return {status,declaredHours:number(ECONOMIC_FIELDS[1]),provisionalLabour:number(ECONOMIC_FIELDS[2]),reviewPending:!!fields[ECONOMIC_FIELDS[3]],verifiedHours:number(ECONOMIC_FIELDS[4]),margin:status==='Completo documentado'?number(ECONOMIC_FIELDS[5]):null,evidence:String(fields[ECONOMIC_FIELDS[6]]||'')};
}
