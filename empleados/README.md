# ASSA · Portal de empleados

## Simplificación y guardado recuperable — 06/11/2026

- Inicio **Hoy** con trabajos del día, próximos trabajos, contactos y planificación pendiente. En móvil, las pantallas secundarias están en **Más**.
- Ficha de trabajo con planificación, relaciones, OT, jornadas y costes en secciones desplegables. Los costes son lectura de Airtable y solo aparecen para administración; no se imputan ni se validan importes desde esta pantalla.
- Las pruebas identificadas se excluyen de Agenda, Hoy y listados habituales sin borrar registros.
- El técnico selecciona una jornada: se conserva un registro por usuario, trabajo y fecha. Los registros anteriores no se migran ni sobrescriben por introducir otro día. Las horas-persona y observaciones de todas las jornadas se incluyen en el resumen previo a la firma. Partes cerrados y PDFs firmados conservan su protección.
- Los borradores de partes y visitas, con fotos comprimidas pendientes, se conservan en IndexedDB del dispositivo por usuario durante un máximo de 24 horas para su recuperación. Se eliminan al completar el guardado o cerrar sesión explícitamente. No se guardan contraseñas ni firmas en los borradores. Si el navegador no admite el almacenamiento, se advierte y el guardado en línea sigue disponible. La carga inicial de la app requiere conexión: no es una app totalmente offline.
- Una visita conserva su ID de operación en un marcador de la tabla existente, sin crear campos nuevos. Los reintentos de su formulario reutilizan el registro. Si fallan fotos, se bloquean los datos ya enviados y se reintentan las fotos restantes.
- Las fotos se identifican por una huella de contenido en el nombre del adjunto, evitando repetirlas si la respuesta se perdió. El bloqueo de edición es por trabajo; las operaciones que afectan a disponibilidad conservan un bloqueo compartido de planificación. Estos bloqueos son de la instancia actual, no una transacción distribuida con agentes externos.
- Ante un conflicto de edición, se conserva el borrador: revisar lo guardado o descartar el borrador local antes de volver a editar. Descartar un borrador no borra registros de Airtable.
- No se activan integraciones nuevas con Calendar/Drive, ni se cambia el plan de Render. El consumo de stock por líneas y la imputación económica siguen requiriendo diseño y validación separados.

Aplicación independiente de ChatGPT y separada de la web pública.
Desplegar desde la rama `portal-empleados-v1` como Web Service Node, comando de inicio `cd empleados && npm start`, comando de construcción `cd empleados && npm install`.

Variables privadas de Render: AIRTABLE_BASE_ID, AIRTABLE_TOKEN, SESSION_SECRET, BOOTSTRAP_USER, BOOTSTRAP_PASSWORD_HASH. Jamás publicar contraseñas ni PAT en GitHub.

Airtable: token restringido a la base Guía de Trabajo y permisos data.records:read y data.records:write. URL de salud: /health.

Los técnicos solo tienen acceso mediante sesión y a sus trabajos activos asignados; los partes se registran en REGISTROS OPERARIOS ASSA, las visitas en VISITAS TÉCNICAS ASSA. Las facturas no se modifican.

Sin AIRTABLE_TOKEN no está operativo el inicio de sesión: la API devuelve 503 hasta configurar las credenciales.


## Partes firmados por el cliente
- Desde un trabajo abierto, el técnico registra horas, materiales y observaciones y pulsa **Firmar y finalizar trabajo**.
- La aplicación muestra un resumen para que el cliente lo revise, admite observaciones y firma manuscrita en la pantalla del móvil.
- Se genera un PDF con referencia de parte, identidad declarada del firmante, fecha/hora española, detalle del trabajo, materiales, observaciones y firma. Es un justificante de recepción con firma simple, no una firma electrónica cualificada.
- El PDF se adjunta en la tabla original **PARTES DE TRABAJO ASSA** → **Parte firmado**, junto al vínculo al registro de TRABAJOS y el estado **Firmado / archivado**.
- Solo tras almacenar el PDF se marca el registro del operario como finalizado y el trabajo como **Terminado**. No modifica la facturación.
- Administración puede abrir trabajos cerrados y consultar el PDF firmado. Los operarios dejan de ver los trabajos cerrados.
- La firma se obtiene del cliente presencialmente; nunca la simules en datos de producción. Verifica la primera firma real con una intervención de prueba y comprueba el PDF adjunto en Airtable.


## Panel de dirección — solo administración
- Nueva pestaña **Dirección**, en escritorio y Android, requiere sesión de administrador también en el servidor.
- Contadores derivados directamente de TRABAJOS y PARTES DE TRABAJO ASSA: activos, trabajos sin PDF de OT firmada registrado, terminados sin factura registrada, envíos no confirmados y cobros pendientes de revisión.
- Excluye registros históricos sin Estado operativo y pruebas identificadas como tal; sin referencia de factura o firma no equivale a probar que el documento nunca existió.
- En TRABAJOS se guardan exclusivamente dos controles manuales de administración: `Factura enviada (portal)` y `Cobro confirmado (portal)`, con sus fechas. Los dos campos **no modifican importes, estado de cobro, referencias fiscales ni crean facturas**.
- Si se marca cobro confirmado pero `Importe cobrado` o `Estado cobro` no concuerdan, se genera una alerta **por conciliar**, no una cifra financiera inventada.
- Solo administración puede consultar `GET /api/admin/dashboard` o editar `PATCH /api/admin/jobs/:id/confirm`, donde `field` se limita a `invoiceSent` y `paymentConfirmed` y `checked` es booleano.
- Las cifras son un resumen operativo del estado actual en Airtable, **no contabilidad certificada**. Los trabajos históricos anteriores al portal pueden no tener firma, factura o cobro documentados en estas tablas.


### Conciliación de fichas y facturas (04/11/2026)
- Verificar primero coincidencia real de cliente, dirección, concepto e importe con los originales de Drive, Gmail o evidencia de cobro; no mezclar personas con nombres parecidos ni documentos de otras instalaciones.
- **Factura localizada** no significa **factura enviada**; solo se confirma envío ante correo, prueba documental o declaración expresa documentada del cliente/administración.
- **Pagado según las notas** no significa **cobro conciliado**; el panel separa ambos conceptos y no rellena importes ni cambia el estado contable por la mera existencia de observaciones.
- Los trabajos anteriores al uso de OT digitales pueden carecer de PDF firmado en Airtable sin que deba suponerse que falta una firma real. Solo se avisa de ausencia de firma cuando existe un registro de OT vinculado.
- El panel incluye **Fichas por completar** para nombres de clientes, vínculo a CLIENTES y referencias fiscales ausentes. **Sin referencia en Airtable** no equivale a que no exista factura.
- Trabajos no facturables expresamente confirmados no entran en avisos de facturación; registros de simulación y facturas históricas sin estado siguen excluidos del panel operativo.
- Los PDFs de facturas, importes cobrados, costes y documentación firmada quedan fuera de cualquier escritura de la auditoría del portal.


### Barrido de cierres, facturas y fichas 05/11/2026
- Cuando Dirección confirme cobro manual en Airtable, cotejar importe con factura real y registrar `Importe cobrado` en la ficha del trabajo, sin alterar facturas originales. No confundir un check de la interfaz con un importe conciliado.
- Los trabajos previos a la firma digital del Portal ASSA que estén terminados, con referencia de factura y cobro completo se mostrarán en **Cerrados y cobrados**. Una antigua OT sin PDF de firma sigue documentándose como **firma no digitalizada**, pero no se trata como una firma nueva pendiente.
- Las fichas de CLIENTES sirven para completar nombres y domicilios visibles que falten en TRABAJOS. Si se toma una dirección del cliente, debe identificarse como domicilio de la ficha y no presumirse que es el lugar de la intervención.
- Conservar pendientes genuinos: pagos parciales, cobros no demostrados y trabajos sin precio o referencia documental. No crear documentos fiscales ni fabricar firmas para cerrar alertas.


## Agenda libre de administración (06/11/2026)
- En **Agenda → Añadir a la agenda**, elegir **Cita libre / recordatorio** para registrar reuniones, contactos informales, gestiones o recordatorios sin seleccionar cliente, intermediario ni operario.
- Solo son obligatorios el título y la fecha; hora de inicio, fin, lugar y observaciones son opcionales. Las citas libres se almacenan en la tabla independiente **AGENDA LIBRE ASSA** de Airtable.
- Solo administración puede ver o crear estas anotaciones por el portal. No se crean registros en TRABAJOS, clientes, partes, órdenes de trabajo, facturas ni unidades de instalaciones de colaborador. No ocupan por sí mismas la disponibilidad de técnicos.
- Para nuevas instalaciones o visitas técnicas oficiales se conserva el formulario existente seleccionando **Instalación / visita técnica**.
- La lista y escritura de notas se exponen por `GET/POST /api/agenda-notes` con sesión de administrador y protección de reintentos mediante operación ID.

## Cancelar y recuperar citas de Agenda (06/11/2026)
- Solo la cuenta principal de administración puede pulsar **Cancelar cita** o **Recuperar cita** desde la agenda. No se eliminan registros.
- Las reservas de trabajo con estado `Cancelado` y las notas con estado `Cancelada` quedan fuera de la vista habitual. **Mostrar canceladas** permite verlas y recuperarlas. Las citas anuladas no ocupan horarios de técnicos.
- La cancelación de trabajos sin ejecución guarda en `TRABAJOS` el estado `Cancelado`, resultado `Cancelado por ASSA` e historial de dirección; no escribe en facturas, cobros, importes ni parte firmado. Los trabajos con ejecución real o partes firmados requieren revisión desde dirección, no cancelación rápida.
- Al recuperar un trabajo se comprueba el solape con otros trabajos activos y que los operarios sigan habilitados. Recuperar no envía notificaciones automáticamente.
- Las citas libres utilizan `Estado agenda` e `Historial agenda` en la tabla `AGENDA LIBRE ASSA`, con acciones de cancelación/restauración solo para la administración principal.
- Las acciones exigen confirmación y comprobación del estado previo, conservan auditoría con usuario y fecha y no generan clientes u órdenes de trabajo. Esta agenda del portal no supone una modificación automática en Google Calendar.

