# Salice Inteligente v0.7.1 — Comprobantes y fojas navegables

## Objetivo

Permitir que la oficina consulte la relación entre una factura y su foja sin crear estados locales, comunicaciones ni planificación adicional.

## Navegación desde una factura

`Cliente → Cuenta corriente → Historial de cuenta` continúa mostrando el estado logístico junto a cada factura. Cuando el comprobante pertenece a una foja, el indicador conserva el número y abre el detalle unificado del comprobante.

El detalle incorpora una tarjeta logística con:

- estado sin asignar, foja abierta o foja cerrada;
- número de foja cuando existe;
- fecha de envío sugerida, identificada expresamente como referencia;
- acceso a la ficha de la foja.

Abrir una foja reemplaza el pop-up del comprobante para evitar capas superpuestas. Desde la foja puede regresarse a cualquiera de sus comprobantes.

## Consulta directa de fojas

`Centro operativo → Rutas` incorpora `Abrir foja`. El selector contiene todas las fojas presentes en el snapshot activo y abre exactamente la misma ficha utilizada desde los comprobantes.

La ficha muestra exclusivamente datos observados:

- número y estado;
- repartidor;
- período desde/hasta;
- fecha y hora de cierre;
- fecha de expedición, cuando GESI la informe;
- zona y subzona;
- comentario general y comentario de expedición;
- cantidad de comprobantes y clientes;
- importe total calculado con las facturas asociadas;
- comprobantes y clientes navegables.

## Contratos

- `shared/models.ts`: amplía `DeliverySheet` con zona, subzona, comentarios y expedición.
- `server/gesi/normalize.ts`: normaliza los campos ya expuestos por GESI sin inferir valores.
- `src/components/InvoiceDetailDrawer.tsx`: conecta comprobante y foja.
- `src/components/DeliverySheetDetailDrawer.tsx`: ficha única reutilizable de foja.
- `src/views/RoutesView.tsx`: acceso directo por número.

Los snapshots creados antes de v0.7.1 no contienen los nuevos campos descriptivos. La interfaz los presenta como no informados; una actualización manual posterior los incorporará mediante el flujo auditado normal.

## Límites

- `Foja cerrada` sólo significa cierre administrativo en GESI.
- `fechaExpedido` y `fechaDeEntrega` están vacíos en la captura real actual.
- No existe prueba de entrega, firma, GPS, recorrido real, incidencia o rechazo.
- La versión no escribe en GESI ni crea un sistema local de despacho.
- No se modifica el tutorial en esta entrega.
