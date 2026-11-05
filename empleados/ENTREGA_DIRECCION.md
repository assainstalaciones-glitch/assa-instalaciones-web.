# Primera entrega: dirección, agenda y revisión de cierre

Solo cambia `empleados/` en `portal-empleados-v1`. No requiere migraciones ni nuevos campos. No ejecuta escrituras al arrancar.

## Disponible

- Panel privado existente ampliado con cola de cierres pendientes.
- Agenda de trabajos abiertos, filtrada por fecha prevista y técnico; pendientes sin fecha o sin asignar visibles. Cada técnico consulta únicamente trabajos propios.
- Administración guarda fecha y técnicos activos, con comprobación de ediciones desactualizadas. No envía notificaciones ni crea citas con hora.
- Firma conserva PDF y bloquea ejecución. El trabajo permanece abierto hasta que la cuenta administrativa principal de Samuel aprueba el cierre. La aprobación registra usuario y fecha en Notas internas de la OT y cambia únicamente el estado operativo a Terminado.
- Se conservan formularios de visitas, horas, materiales, observaciones, fotos y accesos a llamar/Maps.
- Facturas y cobros se consultan; sus confirmaciones están bloqueadas tanto en interfaz como servidor. Los partes firmados y fichas históricas no se editan desde la preparación de OT.
- Roles desconocidos no autentican; usuarios desactivados pierden acceso en la siguiente petición. No se crean administradores mediante el formulario de empleados.

## Persistencia y recuperación

Eventos `PORTAL-REVISION-V1:` en Notas internas de la OT conservan el texto anterior. Solo los nuevos cierres entran en la cola; ninguna OT histórica se migra. PDF y ejecución se conservan por separado del estado operativo y del estado de cobro.

Repetir una firma ya archivada no crea otra OT. La aprobación es idempotente y recupera un fallo al bloquear los partes después de archivar el PDF. Una firma incompleta aparece en dirección y puede reintentarse desde el trabajo. No se garantiza transacción entre Airtable y adjuntos. La exclusión de escrituras del portal es por proceso, adecuada al servicio actual de una instancia; cambios simultáneos directamente en Airtable no tienen compare-and-swap atómico.

## Validación

`npm test` ejecuta comprobación de sintaxis y pruebas Node. Incluye pruebas del servidor con peticiones en memoria y Airtable simulado, generación PDF real, permisos, datos financieros protegidos, agenda, conflictos de edición, firma, reintento, cierre y revocación de acceso. Las plantillas de interfaz se verifican en memoria. Ninguna prueba escribe en la base real.

## Pendiente / límites

- Solo Saúl figura como técnico activo en la lectura del 5/11/2026. Samuel debe crear los accesos de Alex y César desde Empleados con credenciales propias; no se han inventado contraseñas ni identidades.
- Comprobación de uso real iniciando sesión con la cuenta de Samuel y la de Saúl. No se solicitan ni extraen contraseñas de producción.
- Agenda por día, sin horarios, duración, disponibilidad, solapes horarios, Calendar ni avisos automáticos.
- Sin devolución/reapertura del documento firmado: si hay discrepancias, Samuel retiene la aprobación y revisa el caso. Los documentos firmados no se reescriben.
- Rentabilidad, presupuestos/cobros avanzados, mantenimiento, stock/compras e indicadores comerciales corresponden a entregas posteriores.
