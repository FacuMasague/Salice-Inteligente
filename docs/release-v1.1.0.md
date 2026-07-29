# Salice Inteligente v1.1.0

## Alcance

Esta versión amplía Productos, Marcas, Bandeja comercial y Rutas sin cambiar las reglas determinísticas de los reportes ni la arquitectura de despliegue.

### Productos y demanda

- El catálogo y la ficha muestran los kilos observados en `cantidadU2` de los renglones de producto de GESI.
- Demanda y rotación permite ventanas equivalentes de 30, 90 y 180 días.
- Se incorporan filtros por marca, rubro, grupo, línea, disponibilidad, estado maestro, evolución y estabilidad.
- Unidades, kilos, compradores, venta y rotaciones se recalculan sobre el mismo universo filtrado.
- Cuando existen ventas sin kilos confiables se muestra una advertencia; el sistema no estima kilos multiplicando unidades.

### Marcas

- Cada marca muestra su participación en la venta neta y en los kilos netos de los últimos 90 días.
- El universo incluye facturas y notas de crédito de empresa 3, sucursal 3.
- “Sin marca informada” permanece en ambos denominadores.
- Los comprobantes sin detalle generan una advertencia de cobertura.
- El detalle de productos admite grupo, rubro, línea, disponibilidad, estado, búsqueda y orden por dinero, kilos, unidades, compradores o stock.

### Bandeja comercial

- La lista de clientes puede filtrarse por el tipo de cliente informado por GESI, vendedor, localidad y nivel de oportunidad.
- Las vistas guardadas conservan esos filtros junto con la búsqueda y los filtros de recomendación.

### Mapa de fojas

- Rutas incorpora una vista de mapa para fojas abiertas, cerradas y comprobantes sin asignar.
- Se puede filtrar por fechas, estado, chofer, zona, número de foja, localidad y búsqueda.
- La selección muestra clientes, comprobantes, importe y kilos informados.
- Las ubicaciones corregidas se identifican como aproximadas y continúan excluidas de la optimización de recorridos.
- Los comprobantes sin ubicación permanecen en una lista de revisión.

## Compatibilidad de datos

La revisión del snapshot permanece en 11. Los campos de kilos agregados al snapshot son opcionales para que un despliegue pueda abrir el último paquete aprobado y completar los nuevos datos en la próxima actualización. No se reemplaza un paquete válido por una captura fallida.

## Verificación

La entrega debe aprobar `pnpm test` y `pnpm run build`. Las siete pruebas históricas de reconciliación siguen siendo optativas porque requieren fuentes históricas externas al entorno normal de desarrollo.
