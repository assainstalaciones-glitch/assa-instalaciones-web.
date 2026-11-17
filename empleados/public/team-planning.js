import { OPEN_STATUSES, validTime } from './calendar.js';

export const ASSA_TEAMS = Object.freeze([
  {id:'Equipo 1 · Samuel + César',short:'Equipo 1',people:'Samuel + César',users:['samuel','cesar']},
  {id:'Equipo 2 · Alex + Saúl',short:'Equipo 2',people:'Alex + Saúl',users:['alex','saul']}
]);
export const CAPACITY_WINDOWS = Object.freeze([[510,840],[900,1080]]); // 08:30-14:00 y 15:00-18:00
export const DAILY_CAPACITY_MINUTES = 510;

export function addDaysISO(date,days=0){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return '';
  const value=new Date(date+'T12:00:00Z');
  if(Number.isNaN(value.getTime()))return '';
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
export function mondayISO(date){
  const d=new Date(String(date||'')+'T12:00:00Z');
  if(Number.isNaN(d.getTime()))return '';
  const mondayOffset=(d.getUTCDay()+6)%7;
  return addDaysISO(date,-mondayOffset);
}
function minute(t){return validTime(t)?Number(t.slice(0,2))*60+Number(t.slice(3,5)):null;}
function mergedMinutes(ranges){
  const sorted=ranges.filter(([s,e])=>Number.isFinite(s)&&Number.isFinite(e)&&e>s).sort((a,b)=>a[0]-b[0]);
  let start=-1,end=-1,total=0;
  for(const [s,e] of sorted){
    if(start<0){start=s;end=e;continue;}
    if(s>end){total+=end-start;start=s;end=e;}else end=Math.max(end,e);
  }
  if(start>=0)total+=end-start;
  return total;
}
function occupancy(jobs){
  const spans=[],conflicts=[],unknown=[];
  for(const job of jobs){
    const s=minute(job.start),e=minute(job.end);
    if(s===null||e===null||e<=s){unknown.push(job);continue;}
    spans.push({job,start:s,end:e});
  }
  for(let i=0;i<spans.length;i++)for(let j=i+1;j<spans.length;j++){
    if(spans[i].start<spans[j].end&&spans[j].start<spans[i].end)conflicts.push([spans[i].job,spans[j].job]);
  }
  const effective=[];
  for(const span of spans)for(const [windowStart,windowEnd] of CAPACITY_WINDOWS){
    const s=Math.max(span.start,windowStart),e=Math.min(span.end,windowEnd);
    if(e>s)effective.push([s,e]);
  }
  const busy=mergedMinutes(effective);
  return {busyMinutes:busy,freeMinutes:Math.max(0,DAILY_CAPACITY_MINUTES-busy),unknown,conflicts,
    outsideHours:spans.filter(s=>s.start<CAPACITY_WINDOWS[0][0]||s.end>CAPACITY_WINDOWS.at(-1)[1])};
}
export function buildTeamWeek(jobs,monday,today){
  const days=Array.from({length:5},(_,i)=>({date:addDaysISO(monday,i),teams:ASSA_TEAMS.map(t=>({...t,jobs:[]})),unassigned:[]}));
  const dates=new Map(days.map(d=>[d.date,d]));
  const active=(jobs||[]).filter(j=>OPEN_STATUSES.includes(j.status)&&!/^\s*(?:PRUEBA|TEST|SIMULACI)/i.test(j.reference||''));
  for(const job of active){
    const day=dates.get(job.date);if(!day)continue;
    const group=day.teams.find(t=>t.id===job.team);
    (group?group.jobs:day.unassigned).push(job);
  }
  for(const day of days){
    day.teams.forEach(t=>{t.jobs.sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));Object.assign(t,occupancy(t.jobs));});
    day.unassigned.sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
  }
  const overdue=active.filter(j=>j.date&&j.date<today).sort((a,b)=>a.date.localeCompare(b.date));
  const undated=active.filter(j=>!j.date);
  return {days,overdue,undated,
    unassignedCount:days.reduce((sum,d)=>sum+d.unassigned.length,0),
    conflictCount:days.reduce((sum,d)=>sum+d.teams.reduce((n,t)=>n+t.conflicts.length,0),0),
    uncertaintyCount:days.reduce((sum,d)=>sum+d.teams.reduce((n,t)=>n+t.unknown.length,0),0)};
}
