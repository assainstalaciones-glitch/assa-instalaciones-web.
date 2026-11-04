# ASSA · Portal de empleados

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
