export const OUTCOME_FIELD='Resultado intervención (portal)';
export const OUTCOMES=[
 {code:'quote',label:'Visita realizada · pendiente de presupuesto',status:'Presupuesto pendiente',closed:false},
 {code:'materials',label:'Pendiente de material',status:'Aceptado / Programado',closed:false},
 {code:'revisit',label:'Necesita otra visita',status:'Pendiente de visita',closed:false},
 {code:'not_possible',label:'No se puede realizar el trabajo',status:'Cancelado',closed:true},
 {code:'declined',label:'El cliente desiste / no acepta',status:'No aceptado / Sin respuesta',closed:true},
 {code:'cancelled',label:'Cancelado por ASSA',status:'Cancelado',closed:true},
 {code:'completed',label:'Trabajo terminado',status:'Terminado',closed:true,signature:true}
];
export function outcomeOption(code){return OUTCOMES.find(x=>x.code===code);}
export function outcomeVersion(job){return JSON.stringify({status:job.status,outcome:job.outcome||''});}
