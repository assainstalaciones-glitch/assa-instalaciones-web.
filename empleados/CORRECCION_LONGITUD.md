# Guardado de dirección: descripción existente demasiado larga

La descripción del expediente consultado tenía 252 caracteres y el servidor imponía un límite de 220 antes de comprobar si el campo había cambiado. El formulario reenviaba todos los campos, por lo que editar un parte distinto quedaba bloqueado por la descripción intacta.

Se corrige en ambos lados:

- El formulario envía solo campos de la ficha que realmente cambian.
- El servidor ignora los valores sin cambios antes de validarlos, también para clientes que todavía tengan el formulario anterior abierto.
- Las descripciones modificadas admiten hasta 10.000 caracteres sin recorte; la interfaz usa el mismo límite.
- Los errores de longitud identifican el campo y las longitudes admitida/recibida.
- Escribir solo un motivo explica ahora que falta un cambio de ficha/parte y orienta a Resultado de la visita para declarar un trabajo no realizado.
- Un acceso directo desde la edición abre ese resultado y conserva el motivo escrito, sin aplicar automáticamente el cierre.

Validación: regresión del servidor con descripción de 252 caracteres intacta y modificación de observaciones del parte; descripción editada larga sin truncar; error de campo explícito sin escrituras; formulario que omite valores intactos; navegador en móvil con descripción larga, guardado del parte correcto y traslado del motivo al resultado de la visita.

No hay cambios de esquema ni modificación de los datos reales del expediente. Se conserva el circuito de revisión de Samuel, las firmas, las facturas, los cobros y la web comercial.
