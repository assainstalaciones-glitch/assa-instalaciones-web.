# ASSA · Portal de empleados

Aplicación independiente de ChatGPT y separada de la web pública.
Desplegar desde la rama `portal-empleados-v1` como Web Service Node, comando de inicio `cd empleados && npm start`, comando de construcción `cd empleados && npm install`.

Variables privadas de Render: AIRTABLE_BASE_ID, AIRTABLE_TOKEN, SESSION_SECRET, BOOTSTRAP_USER, BOOTSTRAP_PASSWORD_HASH. Jamás publicar contraseñas ni PAT en GitHub.

Airtable: token restringido a la base Guía de Trabajo y permisos data.records:read y data.records:write. URL de salud: /health.

Los técnicos solo tienen acceso mediante sesión y a sus trabajos activos asignados; los partes se registran en REGISTROS OPERARIOS ASSA, las visitas en VISITAS TÉCNICAS ASSA. Las facturas no se modifican.

Sin AIRTABLE_TOKEN no está operativo el inicio de sesión: la API devuelve 503 hasta configurar las credenciales.
