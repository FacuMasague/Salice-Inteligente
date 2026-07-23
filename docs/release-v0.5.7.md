# Salice Inteligente · v0.5.7

## Objetivo

Hacer comparables y trazables los precios de productos sin confundir la referencia informada por GESI con lo realmente observado en las facturas. La entrega agrega historia explícita entre snapshots, evolución efectiva y normalización por kilo sólo donde la presentación es confiable.

## Tres capas que no se mezclan

### Precio de referencia GESI

Es la mediana de valores positivos del canal especializado 3. Si ese canal no tiene datos, se usa el canal general 1 y, como último respaldo, cualquier canal positivo. No es costo, margen, precio obligatorio de venta ni importe final garantizado para un cliente.

El valor actual se compara con el último snapshot GESI preservado anterior. Se informa precio previo, diferencia absoluta, variación porcentual y fecha del último cambio observado. Si no existe un snapshot comparable, se presenta `Nuevo observado` o `Sin base anterior`.

### Precio efectivo neto por U1

Se calcula como:

`importe neto positivo facturado ÷ unidades U1 positivas`

Incluye sólo movimientos de factura de empresa 3 y sucursal 3 con detalle, unidades positivas e importe neto positivo. Las ventanas disponibles son 30, 90 y 180 días y siempre se contrastan con el bloque inmediatamente anterior de la misma duración. Cada observación publica unidades, venta, compradores y cantidad de días con venta.

Este precio puede variar por descuentos, bonificaciones incorporadas al neto, composición de clientes, canales y mix temporal. Por eso se mantiene separado de la referencia.

### Precio por kilo

Se calcula únicamente cuando existe contenido neto por U1 verificable. La referencia por kilo divide la referencia GESI por ese contenido; el efectivo por kilo hace lo mismo con el precio efectivo.

- `Confiable`: contenido neto positivo y relación por U1 validada.
- `Presentación ambigua`: el artículo es alimento seco, pero no se pudo establecer el peso por U1 con confianza suficiente.
- `No aplicable`: el producto no tiene una presentación comparable por kilo y conserva su valor por U1.
- `Sin referencia`: GESI no entregó un precio positivo.

No se extraen pesos dudosos del nombre ni se completan equivalencias de forma silenciosa.

## Historia preservada

`product_price_snapshots` guarda una observación por snapshot y producto en `operations.sqlite`. Dos triggers impiden actualizar o borrar filas: la serie es append-only.

Al iniciar, el sistema incorpora de forma idempotente los snapshots GESI que todavía existan en bundles aprobados y backups locales. Después de cada actualización manual aprobada se agrega la foto nueva. Un candidato rechazado no entra a la serie y Power BI no se usa como origen.

La historia disponible comienza en el snapshot local más antiguo que siga preservado. No se generan puntos diarios ni se interpolan faltantes. `pnpm run backfill:prices` repite la reconstrucción segura y `pnpm run audit:prices` comprueba integridad, cobertura del snapshot activo y protecciones append-only.

## Alertas

Un cambio fuerte comienza en ±15%.

- Referencia: compara los dos últimos snapshots disponibles.
- Efectivo: compara períodos equivalentes y sólo alerta si ambos tienen al menos 5 U1 y 3 días distintos con venta.
- Presentación ambigua: advierte que el precio por kilo no puede calcularse de forma confiable.

El orden inicial prioriza cambio fuerte de referencia, cambio fuerte efectivo, presentación ambigua y luego el resto. Todas las columnas relevantes admiten orden ascendente, descendente y original.

## Interfaz

`Productos → Precios y evolución` incluye:

- selectores de 30, 90 y 180 días;
- indicadores de cobertura y alertas;
- búsqueda y filtros por alerta y calidad del precio por kilo;
- tabla con valores actuales, anteriores, diferencias y última modificación;
- detalle del producto con serie de referencia por snapshot y evolución efectiva mensual;
- acceso a la ficha completa del producto.

Si el navegador carga archivos nuevos mientras todavía sigue abierto un proceso anterior de Express, la pantalla lo identifica en español y solicita reiniciar Salice, en lugar de mostrar el error interno de parseo de Safari. Las rutas API inexistentes tampoco caen sobre `index.html`.

La ficha, el catálogo, las marcas y el comparador nombran expresamente `Precio de referencia GESI` para no presentarlo como precio efectivo.

## Contratos y pruebas

- `shared/product-prices.ts`: comparaciones, muestras mínimas, normalización y alertas.
- `server/product-price-analysis.ts`: consulta reproducible de facturas y construcción de las series.
- `server/product-price-history.ts`: recuperación idempotente de snapshots preservados.
- `shared/product-prices.test.ts`: reglas puras.
- `server/product-price-analysis.test.ts`: ventanas, series y presentaciones ambiguas sobre SQLite sintético.

## Limitaciones reales

- No se dispone de costos o márgenes validados.
- La referencia no representa necesariamente el precio final de cada operación.
- Dos facturas del snapshot vigente no entregaron detalle y no pueden atribuirse a productos.
- El efectivo por U1 sólo es comparable cuando GESI informa unidades coherentes.
- La historia de referencia depende de los snapshots locales efectivamente preservados.
- Esta entrega no modifica el tutorial, no agrega funciones móviles y no automatiza la actualización nocturna.
