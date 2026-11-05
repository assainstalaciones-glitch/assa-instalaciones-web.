# Calendario mensual ASSA · segunda entrega

## Uso

1. Entrar en **Agenda**: vista de mes con días ocupados, horas de inicio y resumen de trabajos; selector de mes y filtro por técnico.
2. Pulsar un día: citas ordenadas por hora con inicio/fin, cliente, ubicación, técnico y accesos a llamar, Maps y trabajo.
3. Pulsar **Añadir aquí**: seleccionar un trabajo existente o introducir una instalación/visita nueva. Fecha, hora de inicio, fin y técnico se guardan en Airtable.
4. Ver las franjas sin reservas por técnico entre 08:00 y 18:00. Son orientación según reservas registradas: no incorporan desplazamientos, vacaciones, descansos, festivos ni Calendar. Las citas pueden introducirse fuera de ese intervalo.

Se pueden programar varias instalaciones el mismo día. Se bloquea el solape de un técnico; se permiten franjas contiguas y trabajos simultáneos de técnicos distintos. Los trabajos sin horario se muestran expresamente y bloquean la presentación de huecos como comprobados. Un técnico solo consulta sus trabajos asignados; la administración planifica el equipo completo.

## Datos

Campos nuevos en TRABAJOS, inicialmente vacíos, sin migración de horas históricas:

- Hora inicio prevista (portal): `fld0SFdrRfpQP5EWV`, texto HH:mm.
- Hora fin prevista (portal): `fldYte8rG57UPtjOP`, texto HH:mm.

Fecha prevista y asignaciones reutilizan los campos existentes. Horarios locales de Europe/Madrid, dentro del mismo día. Una cita nueva exige nombre/contacto, dirección, descripción, técnico y horario; una instalación se guarda como Aceptado / Programado y una visita como Pendiente de visita por acción explícita de administración. No se confirman citas ni se crean instalaciones reales como parte de esta entrega.

Se puede elegir una ficha existente de CLIENTES. Un contacto nuevo se conserva en el trabajo sin crear ni fusionar fichas; si su teléfono ya consta en CLIENTES, se exige seleccionar la ficha correcta. Una clave estable del formulario evita duplicar la creación al reintentar. No se crean partes oficiales ni se consume numeración de OT al reservar una cita.

## Verificación y límites

- Pruebas de calendario: meses de 42 casillas, lunes primero, bisiestos, cambio de año, horas, solapes, huecos y trabajos sin horario.
- Pruebas de servidor con Airtable simulado: permiso administrativo, horario inválido, solapes, varios trabajos el mismo día, técnicos paralelos, reintentos y protección financiera.
- Navegador con datos ficticios: vista mensual, detalle, franjas libres, formulario y móvil a 390 px sin desbordamiento horizontal ni errores JavaScript.
- Se conserva el flujo de cierre con revisión de Samuel, PDFs firmados, formularios actuales y botones llamar/Maps. Sin cambios en facturas, cobros confirmados ni rama main.
- Los solapes se comprueban entre trabajos abiertos con técnicos activos; las ediciones directas simultáneas en Airtable no tienen exclusión atómica. El servicio actual tiene una instancia y las escrituras de planificación del portal se serializan por proceso.
- Sigue pendiente dar de alta Alex y César. No se han inventado sus credenciales. Los horarios antiguos deben completarse con información real desde cada trabajo.
- Todavía no se pueden representar varias jornadas de una misma instalación como eventos separados conservando un único trabajo. No hay programación recurrente, arrastre de eventos ni notificaciones automáticas.
