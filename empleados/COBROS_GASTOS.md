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

## Actualización operativa v4 (16/11/2026)
- Separa total cobrado en TRABAJOS (IVA incluido), cobros fechados en MOVIMIENTOS y deuda real facturada. No asigna fechas automáticamente.
- Cola «Por conciliar»: propone trabajo e importe máximo sin fechar; Samuel introduce cada abono por separado con fecha y evidencia real. La app no rellena la fecha ni inventa el IVA.
- Para evitar importes duplicados, un abono fechado vinculado no puede superar lo cobrado según el trabajo, contando movimientos ya registrados.
- El alta exige confirmación expresa; el cliente debe revisar el tipo de IVA aplicado a cada factura. Un único movimiento no puede resumir abonos de fechas diferentes.
- Los costes directos se analizan sólo cuando las casillas de materiales, extras y horas/MO realmente existen. Campos vacíos no son cero.
- Se muestran conceptos fijos, sus costes medios y estado de confirmación, distinguiendo proyección de gasto real.
- Resumen por fechas y rentabilidad siguen «pendientes de conciliar» hasta completar los ingresos. No declarar como beneficio ni como caja el resultado provisional.
- Acceso financiero restringido a la cuenta principal. Ninguna factura ni ficha TRABAJOS se edita desde finanzas.
- Conciliación bancaria, importación automática de facturas y cierre contable quedan pendientes de justificantes/conexión adecuados: nunca inferir fecha bancaria de la fecha de factura, de trabajo o del checkbox.
- Comprobar en despliegue: 1) build/CI, 2) endpoint /health, 3) acceso anónimo bloqueado, 4) UI móvil; documentar bloqueos.
