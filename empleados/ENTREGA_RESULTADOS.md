# Resultado de visitas y cierre operativo

## Opciones disponibles en el trabajo

| Resultado | Estado operativo | ¿Cierra el caso? |
|---|---|---|
| Visita realizada · pendiente de presupuesto | Presupuesto pendiente | No |
| Pendiente de material | Aceptado / Programado | No |
| Necesita otra visita | Pendiente de visita | No |
| No se puede realizar el trabajo | Cancelado | Sí |
| El cliente desiste / no acepta | No aceptado / Sin respuesta | Sí |
| Cancelado por ASSA | Cancelado | Sí |
| Trabajo terminado | Terminado, con parte firmado y revisión | Sí |

El motivo y el siguiente paso son obligatorios. No se exige firma de ejecución para declarar un trabajo no realizado o desistido. La firma sigue siendo necesaria para acreditar un trabajo terminado. No se inventa un cobro ni se anula un cobro o una factura por cerrar el caso.

## Roles y revisión

- Técnico: comunica el resultado del trabajo asignado. El servidor guarda una solicitud pendiente; no cambia automáticamente el estado. La pantalla guarda primero las horas, materiales, notas y fotos introducidas antes de enviar el resultado. Para trabajo realizado mantiene el flujo de firma.
- Samuel, cuenta principal: registra directamente un resultado o confirma/descarta una solicitud desde Dirección > Resultados de visitas por revisar.
- Otros administradores: pueden consultar las solicitudes; la decisión final corresponde a Samuel.

La revisión conserva quién comunicó el resultado, fecha, motivo y quién tomó la decisión. Una clave estable evita repetir el cierre al reintentar y una prueba criptográfica detecta alteraciones del evento persistido. Se verifica que el estado no haya cambiado desde la solicitud antes de aplicarla. La escritura deja un evento recuperable antes de actualizar el estado; no hay transacción con ediciones externas directas en Airtable.

## Separación de ejecución y cobro

Resultado intervención (portal) es un campo nuevo de texto en TRABAJOS (`fldTw2f5HdRnp4he1`), inicialmente vacío. Motivos y revisión reutilizan Historial dirección (portal). No se migra ni clasifica el histórico automáticamente.

Se reutilizan los estados actuales de Airtable. Si el expediente ya está Facturado o Pendiente de cobro, se conserva ese estado administrativo y se registra el resultado operativo en su campo separado. No se escriben importes, referencias de factura, estado de cobro ni confirmaciones de pago/envío. Una visita podría tener un desplazamiento facturado aunque la instalación no se haga: decidir el resultado de la instalación no liquida esa deuda ni autoriza a cobrar otra.

El panel muestra **Cerrados sin ejecución** separado de **Cerrados y cobrados**, y los resultados registrados siguen visibles para revisión. Un caso pendiente de presupuesto/material/otra visita conserva su siguiente fase y no se contabiliza como cerrado sin ejecución.

Los documentos firmados se conservan. Cambiar un resultado de un expediente ya firmado requiere resolver su revisión o añadir una rectificación de dirección; no se sobrescribe la firma para simular una cancelación.

## Verificación

Pruebas del servidor con Airtable simulado: solicitud de técnico sin cierre automático, aprobación y rechazo de Samuel, motivo obligatorio, idempotencia, firmas, no ejecución, desistimiento, siguientes visitas/material/presupuesto, conservación de facturación y cobros y panel operativo separado. Navegador con datos ficticios: siete opciones, comunicación de técnico y cierre por Samuel, sin errores JavaScript ni desbordamiento en móvil.

No se ha cerrado ni cambiado el resultado de ningún trabajo real durante la implementación. No hay avisos automáticos al cliente, nueva fecha automática, compra de material ni reserva de presupuesto asociada a estas opciones.
