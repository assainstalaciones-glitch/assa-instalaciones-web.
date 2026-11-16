# Cobros y gastos: auxiliar privado

Pantalla de administración con cobros efectivos sin IVA, gastos documentados y previsiones de gastos fijos prorrateadas. El resultado sobre cobros NO es beneficio contable ni saldo bancario.

- Cada pago parcial tiene fecha real, base, IVA, total y evidencia. Los acumulados de TRABAJOS sin desglose se muestran pendientes, nunca se migran por fecha del checkbox.
- Los gastos se registran a fecha de factura, pagados o pendientes. Esta versión permite registro manual; no implica importación automática de Drive/Gmail.
- El total mensual real asociado a un concepto fijo y mes sustituye su previsión. No registrar una factura fija además como gasto adicional. Consolidar varios documentos de un mismo concepto/mes antes de sustituirlo.
- Las previsiones utilizan el valor actual de GASTOS FIJOS ASSA; no se presentan como histórico contable. Importe faltante genera aviso. No duplicar nóminas y mano de obra por trabajo.
- Fechas ISO en Europe/Madrid; días, semanas desde lunes, meses y rango de hasta 367 días.
- Autorización de servidor para lectura administrativa y escritura solo cuenta principal; CSRF existente. POST solo a MOVIMIENTOS ECONÓMICOS ASSA. Facturas y fichas de trabajos no se escriben.
- Idempotencia por operación y detección de factura/pago duplicado; bloqueo concurrente dentro de la instancia del portal. No es un bloqueo distribuido: escritores externos deben conciliar claves; el lector excluye todos los posibles duplicados y avisa.
- No se han cargado datos económicos históricos ni pruebas en producción. Correcciones/anulaciones conservan registro en el auxiliar; no hay borrado ni edición fiscal.
- El registro auxiliar está en Airtable; verificar alcance del token y lectura autorizada en Render antes de activar. Pruebas con datos sintéticos exclusivamente.
