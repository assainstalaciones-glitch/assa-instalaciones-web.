# Colaborador, ocupante y destinatario previsto

La agenda y el detalle del trabajo distinguen quién aporta el encargo, quién recibe la intervención y a quién se prevé facturar. El papel habitual de un colaborador es una sugerencia; se puede elegir Intermediario o Contratista en cada encargo.

## Disponible

- Directorio COLABORADORES ASSA, independiente de CLIENTES: nombre, papel habitual, ficha relacionada opcional, notas y clave de origen.
- Formulario de cita nueva: colaborador, papel, beneficiario/ocupante, relación con el inmueble, teléfono de acceso y destinatario previsto de facturación.
- Detalle del trabajo: resumen de relaciones y formulario de edición reservado a la cuenta principal de Samuel, con motivo, control de versión e historial antes/después.
- Agenda filtrable por colaborador y detalle diario con beneficiario y contacto de acceso.
- Llamar usa el teléfono de acceso cuando está informado, sin sobrescribir el teléfono original del cliente.
- El técnico consulta colaborador y contacto de acceso únicamente en trabajos autorizados; no recibe el destinatario fiscal previsto ni el directorio completo.

## Persistencia y límites

Los nuevos campos de TRABAJOS son Colaborador origen (portal), Colaborador nombre (portal), Papel colaborador (portal), Beneficiario / ocupante (portal), Relación ocupante (portal), Teléfono acceso (portal) y Facturar a previsto (portal).

La ficha de cliente original y las relaciones históricas permanecen intactas. El destinatario previsto se elige expresamente entre fichas de CLIENTES; no se deduce del colaborador, de su papel, del ocupante ni de la ficha relacionada del directorio. La previsión no emite ni modifica facturas, documentos firmados, importes o estados de cobro.

No se clasifican ni migran trabajos antiguos automáticamente. Los registros existentes pueden completarse explícitamente desde su detalle, con auditoría. No se crean citas por dar de alta un colaborador. La revisión documental ayuda a identificar destinatarios de documentos anteriores, pero no determina el papel de un contacto en todos sus encargos.

Una modificación deja un evento recuperable antes de actualizar los campos y verifica valores e historial. El reintento conserva el identificador para evitar duplicados; se detiene si detecta otra edición. No existe transacción atómica con ediciones externas directas en Airtable.

## Validación

Pruebas de separación de identidades y roles, destinatario nunca inferido, rechazo de campos financieros, permisos de técnico/administración principal, auditoría, edición desactualizada, reintentos y cita nueva sin sobrescribir el cliente original. Navegador con datos ficticios: selección de colaborador y papel, inquilino, teléfono de acceso, filtro de calendario, destinatario explícito y móvil sin desbordamiento ni errores JavaScript.
