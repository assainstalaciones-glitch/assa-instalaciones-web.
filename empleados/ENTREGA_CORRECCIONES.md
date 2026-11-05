# Correcciones de dirección

## Problema corregido

Los filtros de ejecución solo consideraban abiertos Pendiente de visita, Aceptado / Programado y En progreso. Un expediente en Presupuesto pendiente aparecía junto a otros estados y las rutas de guardado lo rechazaban. Además, el formulario administrativo buscaba el registro del propio administrador, en lugar de permitir elegir explícitamente el de Saúl.

## Comportamiento

La cuenta administrativa principal tiene **Editar trabajo y parte** en el detalle de cada trabajo, independientemente del estado operativo. Permite corregir nombre/contacto, dirección de intervención, descripción, fecha y horario previstos, asignaciones y un parte del técnico seleccionado. Los técnicos y otros administradores no tienen este permiso especial.

- Motivo obligatorio, control de versión y clave estable de operación.
- Historial con usuario, fecha y valores antes/después en TRABAJOS > Historial dirección (portal).
- Parte sin finalizar ni PDF firmado: corrección del registro original seleccionado, preservando el usuario y las fotos del técnico; los datos anteriores quedan en el historial.
- Parte cerrado o firmado: rectificación añadida al historial, sin sobrescribir el registro original ni el PDF. No se presenta como una nueva firma ni se aplica a los importes de facturación.
- El estado del trabajo no cambia por corregir datos. No hay reapertura automática ni edición de estado fiscal/cobro.
- La interfaz muestra el registro real del técnico en modo consulta y conduce al permiso de dirección para corregirlo. El filtro se llama Otros estados para evitar identificar todo lo no ejecutable como cerrado.
- No se crea una OT para auditar una corrección; no se consume numeración oficial.

Las escrituras registran primero una entrada pendiente y la marcan aplicada tras verificar los cambios. El mismo identificador permite reintentar un fallo parcial sin duplicar la corrección. Si los valores actuales difieren tanto de los anteriores como de los solicitados, se detiene el reintento para evitar sobrescribir otra edición. No hay transacción ni compare-and-swap atómico con ediciones externas directas en Airtable.

## Comprobación

Pruebas del servidor con Airtable simulado: corregir un trabajo en Presupuesto pendiente y el parte de Saúl, conservar estado, motivo, antes/después, rechazar permisos insuficientes, bloquear campos financieros, detectar versión antigua, reintento idempotente y rectificación de parte firmado sin modificar original/PDF. Prueba de navegador con datos ficticios: abrir el expediente no ejecutable, seleccionar su parte, editar horas, guardar motivo y comprobar móvil sin desbordamiento ni errores JavaScript.

El expediente real de Sergi y el registro de Saúl se han consultado para diagnosticar la causa. No se ha cambiado su estado ni su contenido real. Samuel debe realizar la corrección concreta desde su cuenta.
