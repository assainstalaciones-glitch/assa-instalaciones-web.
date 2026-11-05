# Instalaciones para colaboradores

Agenda permite reservar una instalación para un colaborador con dirección, horario y técnico, sin crear ficha ni solicitar datos del cliente final. Las unidades se guardan por encargo (una por defecto).

El técnico guarda el parte y envía la instalación terminada a revisión. Dirección debe aprobarla antes de que compute como realizada. Este circuito no solicita firma al cliente final; los encargos directos mantienen su firma habitual.

Dirección dispone de un recuento por colaborador y fechas, con acceso a cada trabajo. El periodo inicial comprende los últimos quince días y se puede cambiar. Las instalaciones terminadas cuentan por la fecha real del parte y requieren aprobación. Pendientes, canceladas y sin fecha se separan. Dirección puede corregir fecha y unidades con motivo e historial.

El recuento no emite facturas, no confirma pagos y no cambia registros históricos. Los encargos anteriores sin esta modalidad no se incluyen automáticamente. No incluye precios ni genera una factura quincenal.

La reserva requiere hora de entrada; el fin previsto es opcional. Sin duración conocida la agenda avisa que la disponibilidad requiere comprobarse. No se inventan franjas libres. Se detectan entradas simultáneas y entradas dentro de reservas de duración conocida.

El parte permite guardar entrada y salida reales en campos separados de la planificación, sin modificar el horario previsto ni calcular cobros. Las horas trabajadas siguen siendo independientes para poder reflejar pausas. No se rellenan horas de partes históricos.

Validación: 72 pruebas automatizadas y pruebas de navegador de reserva sin fin, registro de horas reales, reserva por dirección, parte del técnico, aprobación, recuento, flujo directo y móvil, usando datos simulados.
