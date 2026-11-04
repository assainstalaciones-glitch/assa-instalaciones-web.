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
