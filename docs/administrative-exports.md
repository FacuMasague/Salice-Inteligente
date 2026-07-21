# Matriz de exportaciones administrativas

La v0.3.0 define qué exportaciones conviene implementar en el núcleo administrativo. La generación de archivos queda para v0.4.x, junto con el explorador general de ventas y sus drill-downs.

| Prioridad | Vista | Formato inicial | Grano | Campos mínimos | Motivo |
|---:|---|---|---|---|---|
| 1 | Saldos Pendientes | XLSX/CSV | Comprobante abierto | cliente, vendedor, emisión, vencimiento, saldo, antigüedad, forma de pago | Gestión y conciliación administrativa |
| 1 | Ventas · Comercial | XLSX/CSV | Cliente-producto-período | fecha, comprobante, vendedor, cliente, producto, marca, rubro, kilos, unidades, venta neta | Análisis y control comercial |
| 1 | Agenda | XLSX/CSV | Tarea o gestión | fecha, responsable, cliente, origen, estado, resultado, importe, próxima acción | Seguimiento operativo |
| 2 | Cuentas no compradoras | XLSX/CSV | Cliente o marca | última compra, ventanas 30/90/180, promedio, vendedor, filtros aplicados | Campañas de recuperación |
| 2 | Objetivos y cumplimiento | XLSX/PDF | Lectura-mes-dimensión | versión del plan, objetivo, real, diferencia, cumplimiento, proyección | Reuniones y trazabilidad del plan |
| 3 | Reportes de proveedor | XLSX/PDF | Marca-producto-período | universo, corte, kilos, clientes, comparación, filtros | Intercambio externo controlado |

Reglas para todas las exportaciones:

- incluir fecha de generación, corte del dato, universo y filtros;
- usar exactamente las métricas del catálogo central;
- distinguir resultado GESI de objetivo o configuración externa;
- no exportar secretos ni campos personales que la tarea no necesite;
- CSV/XLSX conserva datos de detalle; PDF se reserva para una presentación estable y resumida;
- el total exportado debe reconciliar con la vista filtrada antes de habilitar la descarga.
