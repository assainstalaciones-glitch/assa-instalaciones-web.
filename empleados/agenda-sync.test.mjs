import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAgendaIntent,agendaLedgerFields,planCalendarAction,calendarJobMarker,calendarBelongsToJob} from './agenda-sync.mjs';

const WORK='rec00000000000101';
const schedule={date:'2026-11-12',start:'09:30',end:'',assigned:''};
const old={...schedule,start:'12:00'};
const event={id:'calendar-123',status:'confirmed',description:calendarJobMarker(WORK),
  start:{dateTime:'2026-11-12T12:00:00+01:00'}};

test('Cambio de horario produce una operación trazable, sin tocar facturación',()=>{
  const intent=makeAgendaIntent({jobId:WORK,action:'schedule',before:old,after:schedule,operationId:'12345678-test',
    by:'admin',at:'2026-11-11T19:00:00Z'});
  const fields=agendaLedgerFields(intent);
  assert.equal(fields['Estado'],'Pendiente de verificar');
  assert.equal(fields['Tipo de cambio'],'Cambio de horario');
  assert.equal(fields['Clave de operación'],'portal:'+WORK+':schedule:12345678-test');
  assert.deepEqual(JSON.parse(fields.Después),schedule);
  for(const protectedField of ['Ref. factura','Importe cobrado','Importe total','Fecha realizado','Estado cobro'])
    assert.equal(Object.hasOwn(fields,protectedField),false);
});

test('Misma operación se identifica igual tras un reintento',()=>{
  const args={jobId:WORK,action:'cancel',before:schedule,after:{status:'Cancelado'},
    operationId:'ab12cd34-5678',at:'2026-11-11T19:00:00Z'};
  assert.equal(makeAgendaIntent(args).key,makeAgendaIntent(args).key);
});

test('Cancelación de una cita con vínculo inequívoco propone cancelar solo ese evento',()=>{
  const intent=makeAgendaIntent({jobId:WORK,action:'cancel',operationId:'abcd1234'});
  assert.deepEqual(planCalendarAction(intent,[event]),{kind:'cancel',eventId:'calendar-123',requiresReadback:true});
  assert.deepEqual(planCalendarAction(intent,[{...event,status:'cancelled'}]),
    {kind:'already-done',eventId:'calendar-123'});
});

test('Una visita cancelada sin referencia explícita no borra eventos por similitud',()=>{
  const intent=makeAgendaIntent({jobId:WORK,action:'cancel',operationId:'abcd1234'});
  assert.equal(planCalendarAction(intent,[{id:'oscar-1',summary:'Visita de prueba',status:'confirmed'}]).kind,'review');
  assert.equal(planCalendarAction(intent,null).kind,'block');
});

test('Dos eventos vinculados bloquean cualquier modificación hasta conciliar',()=>{
  const intent=makeAgendaIntent({jobId:WORK,action:'schedule',operationId:'abcd1234'});
  assert.equal(planCalendarAction(intent,[event,{...event,id:'calendar-duplicate'}]).kind,'block');
});

test('Nunca se restaura silenciosamente un evento cancelado',()=>{
  const intent=makeAgendaIntent({jobId:WORK,action:'restore',operationId:'abcd1234'});
  assert.equal(planCalendarAction(intent,[{...event,status:'cancelled'}]).kind,'review');
});

test('Solo un marcador exacto o propiedad privada autoriza el vínculo',()=>{
  const other='rec00000000000102';
  assert.equal(calendarBelongsToJob(event,WORK),true);
  assert.equal(calendarBelongsToJob(event,other),false);
  assert.equal(calendarBelongsToJob({extendedProperties:{private:{assaJobId:WORK}}},WORK),true);
});

test('No se aceptan IDs o acciones mal formadas',()=>{
  assert.throws(()=>makeAgendaIntent({jobId:'123',action:'schedule'}));
  assert.throws(()=>makeAgendaIntent({jobId:WORK,action:'invoice'}));
});
