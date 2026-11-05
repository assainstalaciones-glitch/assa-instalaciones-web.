export const OPEN_STATUSES=['Aceptado / Programado','En progreso','Pendiente de visita'];
export function madridToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function validTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function assignedUsers(value){return String(value||'').toLowerCase().split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);}
export function overlap(a,b){return validTime(a.start)&&validTime(a.end)&&validTime(b.start)&&validTime(b.end)&&a.start<b.end&&b.start<a.end;}
export function calendarCells(month){
 if(!/^\d{4}-\d{2}$/.test(month))return [];
 const [year,m]=month.split('-').map(Number);if(m<1||m>12)return [];
 const first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7;
 return Array.from({length:42},(_,i)=>{const d=new Date(Date.UTC(year,m-1,i-offset+1));return {date:d.toISOString().slice(0,10),day:d.getUTCDate(),inMonth:d.getUTCMonth()===m-1};});
}
export function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
export function dailyGaps(jobs,user,start='08:00',end='18:00'){
 const assigned=jobs.filter(j=>OPEN_STATUSES.includes(j.status)&&assignedUsers(j.assigned).includes(user));
 if(assigned.some(j=>!validTime(j.start)||!validTime(j.end)||j.start>=j.end))return {unknown:true,gaps:[]};
 const spans=assigned.filter(j=>j.end>start&&j.start<end).sort((a,b)=>a.start.localeCompare(b.start));
 let cursor=start;const gaps=[];
 for(const span of spans){if(span.start>cursor)gaps.push({start:cursor,end:span.start});if(span.end>cursor)cursor=span.end;}
 if(cursor<end)gaps.push({start:cursor,end});return {unknown:false,gaps};
}
