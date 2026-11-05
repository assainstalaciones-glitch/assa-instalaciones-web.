# ASSA — Diseño de conciliación documental automática
**Versión de diseño:** 2026-11-05 · **Estado:** propuesta; no habilitar escrituras financieras ni tareas programadas hasta validar piloto.

## Objetivo
Relacionar TRABAJOS y CLIENTES de Airtable con la documentación de Google Drive y, cuando proceda, las evidencias de envío de Gmail. Reducir falsos avisos en Portal ASSA. Nunca editar, sobrescribir, mover ni borrar facturas originales. Nunca dar por verificado un cobro sin prueba independiente.

## Sistemas y límites reales
- **Airtable** (base actual "Guía de Trabajo"): tablas existentes TRABAJOS, CLIENTES, PARTES DE TRABAJO ASSA y REGISTRO PRESUPUESTOS ASSA.
- **Google Drive**: PDFs de facturas oficiales, presupuestos y documentación. Usar fuente original y su identificador real; nunca usar la búsqueda por nombre como único criterio.
  - Carpeta de facturas reales 2026 identificada y verificada en búsqueda por contenido: `FACTURAS 2026`, Google Drive folder ID `13eTstjOHpdAqS9XNQjZNTNtVrJsH9wn-` (`https://drive.google.com/drive/folders/13eTstjOHpdAqS9XNQjZNTNtVrJsH9wn-`). Contiene, entre otras, las facturas 070-26 a 077-26. Es la **primera carpeta autorizable del piloto**, no un permiso para escanear toda la unidad.
  - Existen otros directorios también llamados `FACTURAS 2026` y `FACTURAS`; no fusionar contenidos por nombre de carpeta. Uno de los otros `FACTURAS 2026` contiene `001-2026 MONTGAS`, que puede corresponder a otra serie y no debe confundirse con la numeración `001-26`.
  - El directorio `03 FACTURAS EMITIDAS — SOLO SAMUEL` se ha localizado, pero no mostró documentos al consultar su contenido; comprobar con el usuario su uso antes de extender el alcance.
- **Gmail**: únicamente si se comprueba que un mensaje enviado contiene la factura correcta dirigida al destinatario correcto. Que exista un PDF en Drive no demuestra que se haya enviado.
- **Portal ASSA/Render**: acceso de administrador ya configurado para Airtable. El servidor NO dispone de las credenciales OAuth de Drive de la cuenta del usuario; un conector de ChatGPT no se puede reutilizar automáticamente en Render. Se requiere (a) un agente autorizado con acceso a conectores Drive/Airtable que sincronice metadatos, o (b) OAuth/servicio Google propio debidamente autorizado para el servidor.
- **Pruebas de cobro**: recibos bancarios contrastados, movimientos identificados del banco o confirmación humana con soporte documental. El checkbox manual, la coincidencia entre "Importe total" e "Importe cobrado", la presencia de factura, el correo enviado o las notas del técnico no bastan por sí solos.

## Distinciones obligatorias (nunca fusionar)
1. **Factura localizada en Drive:** PDF comprobado; referencia y total verificables.
2. **Factura vinculada al trabajo:** factura y trabajo pertenecen a la misma operación, con coincidencia única.
3. **Factura enviada:** mensaje saliente o evidencia documental válida de envío, comprobados.
4. **Cobro declarado o registrado:** estado/importe indicado en Airtable o por administración, no verificación bancaria.
5. **Cobro documentalmente verificado:** documento de pago contrastado y relacionado con la factura; anotar autor, fecha y procedencia.
6. **Trabajo cerrado operativamente:** OT/parte terminado; independiente de facturación.
7. **Trabajo liquidado administrativamente:** factura vinculada y pago verificado; si falta prueba, usar "Cobro registrado · pendiente de verificar" y no "liquidado verificado".

## Modelo de datos propuesto en Airtable (no creado aún)
### Tabla A: DOCUMENTOS VERIFICADOS ASSA
Una fila por documento y versión de origen, no una copia del PDF.
- Clave de idempotencia (única): `provider:file_id:revision`; fichero original; URL HTTPS oficial; tipo (factura, presupuesto, correo, justificante).
- Número y fecha factura; emisor ASSA verificado; cliente fiscal; total IVA incluido; referencia de trabajo/presupuesto cuando conste; fecha de detección; última revisión; hash/revisión si la fuente lo ofrece.
- Identidad del documento (solo metadatos mínimos); nunca almacenar tokens, contraseñas o datos bancarios completos.
- Documentos anulados, duplicados físicos o versiones corregidas: marcar revisión y conservar enlaces; no asumir que la última carga reemplaza una factura.

### Tabla B: CONCILIACIONES ASSA
Una fila por `trabajo_id + documento_id + tipo_de_prueba`, con deduplicación antes de crear.
- Trabajo (enlace a TRABAJOS); cliente (enlace a CLIENTES); documento origen (enlace a DOCUMENTOS VERIFICADOS ASSA).
- Categoría: factura sin vincular, datos de cliente, envío sin verificar, cobro sin justificar, conflicto, posible duplicado.
- Resultado: **Coincidencia documental**, **Propuesta para revisar**, **Conflicto**, **Descartado**, **Aplicado**.
- Motivo verificable: número factura, cliente/NIF, dirección, concepto, fecha, importe exacto, cada uno con coincidencia o discrepancia. Nunca usar puntuación opaca sin explicación.
- Cambios propuestos en CRM, fecha, responsable y resolución; una única revisión vigente por clave; historial de auditoría.

## Motor de coincidencias (orden obligatorio)
1. Indexar Drive **solo lectura**, con alcance limitado a carpetas/archivos de ASSA autorizados. Normalizar números 076-26, fechas, tildes y alias (Pep/Josep); no deducir apellidos ni asignar identidades por parecidos.
2. Identificar emisor y documento real, no PDF de presupuesto o pedido ajeno. Descartar documentos ajenos y versiones anuladas.
3. Cotejar con TRABAJOS y CLIENTES: referencia de factura + año, nombre fiscal o NIF exacto, dirección, importe total con tolerancia **máxima 0,01 €**, concepto y relación temporal.
4. **Vinculación automática propuesta, no aplicada** solamente con identificador único y al menos dos anclajes independientes coherentes (ej. nº factura + cliente fiscal + total). Cualquier importe discordante, identidad conflictiva o dos trabajos posibles => revisión manual. Varias partidas de una factura o una factura para varios trabajos => revisión humana, sin regla 1:1.
5. Si un campo ya tiene valor contradictorio, nunca sobrescribirlo. Si hay un PDF firmado, nunca reabrir ni sustituir la OT.
6. Confirmación de envío solo después de verificar destinatario, fecha, mensaje enviado y documento adjunto correcto; un email con asunto "factura" no basta.
7. Cobro: **ninguna propuesta puede escribir** "Importe cobrado", "Estado cobro", "Cobro confirmado (portal)" ni "Fecha confirmación cobro". En el piloto, solo hay evidencia de pago **pendiente de revisión**, no confirmación automática. Si en una futura fase se habilita conciliación bancaria, requerirá permisos y aprobación explícitos.

## Automatización existente a proteger
La automatización activa `ASSA — Cobros automáticos` cambia "Estado cobro" a Cobrado/Parcial/Pendiente basándose en "Importe cobrado" e "Importe total". Esta clasificación **no es evidencia bancaria**. Mantenerla sin tocar durante la fase de diseño; no usarla como prueba de liquidación.
Asimismo, la automatización "Crear parte al programar trabajo" es independiente: no debe dispararse ni crear duplicados durante la conciliación de facturas.

## Comportamiento del Portal (administración)
Nueva pestaña **Conciliación** con cuatro colas: (1) facturas encontradas sin vincular; (2) coincidencias de alta confianza propuestas; (3) cobros registrados pero sin justificante; (4) conflictos/documentos duplicados.
Cada ficha muestra cliente, trabajo, nº factura, total, fuente Drive/Gmail, fecha, por qué coincide y qué dato falta.
Acciones con sesión admin y confirmación: **Revisar vínculo**, **Aprobar completar referencia/nombre faltante**, **Descartar**, **Mantener pendiente**. Los técnicos no ven este panel ni el documento fiscal. El enlace al PDF abre Google Drive con sus permisos existentes; no copiar contenido a un endpoint público.
Registrar usuario y marca temporal de cada aceptación; mostrar siempre "propuesto" hasta aplicar y verificar por lectura posterior.
Estado visible en Dirección: "Factura vinculada", "Envío documentado", "Cobro registrado, sin comprobante", "Cobro verificado" (solo con evidencia validada).

## Límites de escritura por fase
- **Fase 0 — Diseño:** ninguna factura ni cobro se modifica. Inventario de campos y permisos.
- **Fase 1 — Índice de evidencias:** sincronizar únicamente nuevas tablas de evidencias/revisiones; nunca escribir TRABAJOS, CLIENTES, facturas ni estados de pago.
- **Fase 2 — Propuestas en Portal:** consulta y revisión humana; aplicar solamente enlaces y campos vacíos no financieros aprobados por Samuel; prohibir sobreescritura y operaciones duplicadas.
- **Fase 3 — Operativa periódica:** ejecución diaria con informes de incidencias, reintentos limitados, auditoría; no mensajería automática a clientes, ni envío de facturas, ni cierre de cobros por la mera coincidencia numérica.
- **Fase 4 — Conciliación bancaria (opcional):** solo con fuente bancaria específica, controles de permisos y aprobación separada. No incluida en este proyecto por defecto.

## Pruebas de aceptación (obligatorias antes de producción)
- Alias: "Pep" y nombre fiscal completo se pueden proponer sin mezclarlos con otra persona; presupuesto y factura exactos.
- Factura 067-26 de la caldera de Merche no puede atribuirse a todos sus trabajos históricos.
- El cobro parcial (ej. 700 € de una factura mayor) nunca se declara totalmente verificado.
- Una factura existente sin prueba de envío permanece "Envío sin verificar".
- Un registro "Cobrado" sin justificante queda "Cobro registrado, prueba pendiente".
- TSS y otros cobros pendientes nunca se cierran por una factura localizada.
- Dos PDFs con la misma referencia, una factura rectificativa o un NIF distinto => conflicto.
- Una ejecución repetida no crea registros duplicados; relectura valida cada actualización.
- El portal técnico y la web corporativa siguen operativos y sin acceso nuevo a facturas.

## Secuencia recomendada
1. Validar acceso autorizado de una tarea de lectura periódica a Drive y Airtable, sin compartir secretos en código.
2. Crear las dos tablas propuestas con claves únicas, permiso solo administración y backup de la configuración.
3. Ejecutar una búsqueda piloto **solo lectura** en 10 trabajos (Pep, Merche, María Dolores, factura parcial de Sandra, TSS, entre otros).
4. Revisar resultados y discrepancias con Samuel.
5. Publicar pestaña "Conciliación" en el portal, que lea exclusivamente propuestas comprobadas de Airtable.
6. Activar tarea programada solo después de validar resultado, duplicados y control de permisos.

**Fecha:** 05/11/2026. **Alcance de esta entrega:** diseño documentado, sin activar un escaneo diario y sin escribir documentos fiscales ni estados bancarios.


## Piloto de índice y visualización realizado — 05/11/2026
- Tablas creadas en la base Guía de Trabajo: `DOCUMENTOS VERIFICADOS ASSA` (`tblW53PDguHrrOIs1`), `CONCILIACIONES ASSA` (`tblMvunG5HhUA1qia`).
- Se indexaron 11 archivos físicos (una copia duplicada de la factura TSS 057-26) y 10 propuestas únicas: 6 coincidencias documentales, 4 para revisar.
- Identidad e idempotencia: `Clave documento=drive:<fileId>:revision-v1` y `Clave propuesta=match:<workId>:<invoice>:invoice-v1`. Crear o actualizar solo mediante upsert por estas claves; nunca crear nuevos registros sin comprobar.
- Cada propuesta enlaza una sola factura principal indexada, el trabajo y cliente Airtable y conserva los motivos verificables. La copia física duplicada de TSS está indexada sin generar una segunda conciliación.
- Estado envío solo `Envío verificado` cuando Gmail muestra el mensaje enviado con adjunto exacto: 073-26 Pilar Gil y 057-26 TSS. El resto: `Sin evidencia de envío`, no `No enviado`.
- Estado cobro documental distinto del importe anotado: 0 justificantes bancarios contrastados durante este piloto.
- Endpoint exclusivo administrador `GET /api/admin/reconciliation`; deniega técnicos mediante `reqAdmin(user)`. Nueva pestaña Conciliación, con vistas de propuestas, coincidencias documentales, nombres fiscales, explicaciones y enlaces al PDF original en Drive.
- **Estado de esta entrega: solo lectura en portal y ninguna automatización periódica de Drive.** El portal NO recibe OAuth de Drive ni tiene permisos para modificar facturas, cobros o fichas desde esta pantalla.
- Los datos del piloto se cargaron tras consulta autorizada de Drive/Airtable a través de conectores existentes. La actualización automática del índice necesitará una integración autorizada por separado.


### Revisión administrativa sin aplicación automática
- Campo `Decisión administración` en CONCILIACIONES ASSA: `Pendiente` (vacío), `Validada sin aplicar` o `Descartada`.
- `PATCH /api/admin/reconciliation/:id/decision`: protegido por sesión administradora, comprobación de origen y existencia del documento indexado. Solo permite una primera decisión, sin sobrescribir una decisión ya tomada.
- Guarda usuario en `Revisado por` y la fecha en `Fecha de decisión`. No cambia TRABAJOS, CLIENTES, facturas, envío ni cobro.
- El usuario confirma expresamente la decisión en pantalla. Rectificaciones posteriores requieren revisión manual de auditoría en Airtable, no un segundo clic accidental.
- La pestaña Conciliación muestra los filtros Para revisar, Coincidencias documentales, Revisadas y Todos.
