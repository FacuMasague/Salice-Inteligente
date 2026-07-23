# Salice Inteligente v0.5.9 · Ciclo de incidencias de inventario

## Objetivo

Evitar que un producto quede marcado como `Revisado` indefinidamente cuando el problema observado se resuelve y luego reaparece. La aplicación vuelve a evaluar cada revisión contra el snapshot activo y conserva por separado la señal de GESI y el trabajo humano de oficina.

## Universo y fuente

- Productos de la bandeja de inventario: maestros con stock positivo o rotación en los últimos 90 días.
- Señales de inventario: snapshot activo de GESI, empresa 3, sucursal 3 y depósito 2.
- Estado, nota, excepción e historial de revisión: persistencia operativa local en `operations.sqlite`.
- Corte: `meta.generatedAt` del snapshot que produjo cada clasificación.

La conciliación no modifica existencias, ventas, productos ni facturas. Power BI no participa del cálculo.

## Ciclo de una incidencia

1. Una persona puede dejar el producto como `No revisado`, `En revisión` o `Revisado` y guardar una nota o excepción.
2. Al guardar, se conserva la clasificación exacta y el corte del snapshot contra el que se realizó la revisión.
3. Si una incidencia revisada deja de estar presente, se registra automáticamente como resuelta. La revisión humana no se borra.
4. Si después de esa resolución aparece una nueva alerta, el producto vuelve a `No revisado`, la interfaz lo identifica como `Reabierto` y aumenta el número de incidencia.
5. Si una revisión cerrada cambia directamente a una familia de problema distinta, también se reabre.

Una reapertura no registra una gestión ni una tarea realizada. Sólo vuelve a poner el producto frente a la oficina.

## Familias y control de ruido

- `Faltante`: sin stock con demanda, cobertura crítica y cobertura baja.
- `Exceso`: cobertura alta y stock sin movimiento.
- `Calidad de datos`: información insuficiente para clasificar.
- `Historia`: producto nuevo o sin historia suficiente.
- Sin incidencia: cobertura adecuada o producto fuera de surtido.

Un cambio dentro de la misma familia —por ejemplo, de cobertura crítica a baja— no reabre la revisión. Un cambio entre familias sí representa un problema diferente. La excepción `Discontinuado` queda excluida de la reapertura automática mientras continúe vigente.

## Persistencia y migración

`inventory_alert_reviews` conserva el estado vigente y suma:

- clasificación y snapshot de referencia;
- fecha y snapshot de resolución;
- fecha de última reapertura;
- número de incidencia.

`inventory_alert_review_events` registra eventos `review_saved`, `resolved` y `reopened`. Dos triggers impiden actualizar o eliminar ese historial. Las filas previas a v0.5.9 reciben una línea de base en la primera conciliación: no se supone una resolución anterior ni se las reabre artificialmente.

La conciliación se ejecuta al iniciar el servidor y antes de devolver la lista de revisiones. Es idempotente para un mismo estado y snapshot.

## Interfaz y API

- La bandeja distingue visualmente `Reabierto` y muestra el número de incidencia.
- El resumen separa reabiertos, en revisión, pendientes y revisados.
- El modal explica la reapertura o resolución y permite desplegar el historial del producto.
- La ficha de Catálogo usa el mismo estado vigente y muestra la incidencia cuando corresponde.
- `GET /api/inventory-alert-reviews/:productId/events` expone sólo el historial local del producto.
- `PUT /api/inventory-alert-reviews/:productId` continúa guardando la decisión humana y ahora asocia la clasificación y el corte activos.

## Contratos y pruebas

- `shared/inventory-decisions.ts`: familias, etiqueta visible y transición determinística.
- `server/operational-store.ts`: migración, estado vigente, historial append-only y conciliación.
- `shared/inventory-decisions.test.ts`: estabilidad dentro de una familia, resolución, recurrencia, cambio de familia y excepción de discontinuado.
- `server/operational-admin.test.ts`: migración, persistencia, reapertura, incremento de incidencia e inmutabilidad del historial.

## Limitaciones reales

- La detección ocurre cuando el servidor lee un snapshot nuevo; no existe actualización nocturna automática.
- Una incidencia puede resolverse o reaparecer sólo según las señales que GESI entregue en el snapshot activo.
- No se infieren causas, compras, órdenes pendientes, stock comprometido ni reposición.
- Las revisiones anteriores no poseen historia retroactiva: se conserva una línea de base desde v0.5.9.
- No se modificó el tutorial y no se agregó experiencia móvil.

## Validación

- Suite completa: 166 pruebas aprobadas, 7 conciliaciones históricas omitidas de manera explícita y 0 fallas.
- Pruebas específicas del ciclo y la persistencia: 17 aprobadas.
- Build de producción: correcto con TypeScript y Vite.
- Auditoría de datos: 0 problemas.
- Integridad de operaciones: correcta sobre 19 tablas.
- Auditoría de plataforma: 23 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de cobertura/calidad de GESI.
- Auditorías de vectores y de historia de precios: aprobadas; 4 snapshots y 8.147 observaciones de precios íntegras.
- Backup operativo creado antes de migrar la base real; la migración agregó el historial sin descartar la revisión existente.
- Revisión visual de escritorio: contador, fila reabierta, número de incidencia, explicación, historial desplegable y ficha de producto verificados sobre una copia temporal de la base. Consola sin errores ni advertencias.
