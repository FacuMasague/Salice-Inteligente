# Catálogo central de métricas y datos · v0.6.5

La fuente ejecutable del catálogo es `shared/metrics.ts`. La misma definición se publica en `GET /api/metrics/catalog` y se presenta en Configuración. Este documento explica el contrato de mantenimiento; no reemplaza a las fichas particulares de `docs/powerbi`.

`server/report-metrics.ts` ejecuta las agregaciones compartidas de kilos, unidades, venta neta y clientes, junto con las funciones únicas de cociente, variación y participación. `server/report-universes.ts` mantiene los universos ejecutables y comprueba su alineación con el catálogo. La respuesta del catálogo vincula cada endpoint con sus métricas y cada endpoint publica el mismo vínculo mediante `X-Salice-Metrics`.

## Contrato de una métrica

Cada métrica debe declarar:

- identificador estable y nombre visible;
- descripción y unidad;
- fórmula reproducible;
- fuente operativa;
- grano de cálculo;
- campo o regla de fecha;
- pantallas consumidoras;
- salvedades de calidad o interpretación.

Antes de cambiar una fórmula se deben localizar todos sus consumidores en el catálogo y revisar los universos de cada reporte. Compartir una métrica no obliga a compartir universo: Venta neta, por ejemplo, conserva la misma definición matemática, pero SPT y Ventas · Comercial aplican alcances distintos.

## Contrato de un universo

Los universos quedan versionados por reporte con empresa, sucursal, emisor, inclusiones, exclusiones, regla de vendedor, regla temporal y fuente. Las pruebas de `server/report-universe-contract.test.ts` verifican que empresa y sucursal publicadas coincidan con las implementaciones vigentes.

## Cortes temporales

`server/reporting-periods.ts` centraliza fechas UTC estables, inicio y fin de mes, corrimientos mensuales, cortes equivalentes, días inclusivos y las ventanas de tres meses completos. Un período parcial se compara contra la misma cantidad de días; sólo una ficha documentada puede conservar una tarjeta histórica con otra semántica.

## Calidad visible

`GET /api/system/data-health` informa frescura, cobertura y estado de cada artefacto. `pnpm run audit:platform` cruza snapshot, staging, base comercial, saldos pendientes y catálogo. Un control obligatorio fallido impide aprobar una actualización; una limitación conocida de GESI se conserva como advertencia visible.

La auditoría también verifica el manifiesto activo, los contratos ejecutables, la auditoría vectorial y `integrity_check` de la persistencia operativa. La comparación entre versiones vectoriales es obligatoria cuando el motor del candidato difiere del activo; una actualización de datos que conserva la misma versión no debe repetir ni simular esa transición.

En v0.5.1 el catálogo llega a la versión 1.3.0 con 24 métricas. Se incorporan `inventory.available_u1`, `inventory.rotation_90d`, `inventory.coverage_months` e `inventory.last_sale`. Las cuatro comparten corte, grano, unidad y salvedades; ninguna pantalla puede redefinir silenciosamente stock, rotación o cobertura.

En v0.5.3 la ficha de producto no crea una segunda definición de venta o compradores. Reagrupa las compras normalizadas de la misma ventana de 90 días en tres bandas móviles consecutivas de 30 días, terminadas en la fecha del snapshot. Cada banda declara sus fechas exactas y no se presenta como mes calendario. El ranking de compradores suma los mismos renglones positivos por cliente y producto; una factura sin detalle no se atribuye artificialmente.

En v0.5.4 las 33 dimensiones del producto siguen siendo descriptivas. Rotación, adopción y popularidad permanecen métricas separadas. El motor v2.2 se compara contra v2.1 antes de activar y las correcciones humanas se aplican desde `operations.sqlite` con motivo, autor e historial, sin reescribir el snapshot ni habilitar modificaciones automáticas por IA.

En v0.5.6 el catálogo llega a la versión 1.4.0 e incorpora demanda U1, compradores por ventana, días desde última venta, variación equivalente y estabilidad de rotación. Las ventanas de 30, 90 y 180 días terminan en la fecha máxima de la base comercial y se comparan con el bloque anterior de igual duración. Demanda usa únicamente unidades positivas de facturas con detalle; las notas de crédito no se presentan como demanda. Compradores se recalcula por dimensión para evitar dobles conteos. La cobertura desde GESI permanece visible y una historia parcial nunca se etiqueta como falta de demanda.

En v0.5.7 el catálogo llega a la versión 1.5.0 e incorpora `product.reference_price`, `product.effective_price_u1`, `product.reference_price_per_kg` y `product.price_variation`. La referencia usa el precio positivo seleccionado de GESI; el efectivo divide importe neto facturado por unidades U1 positivas; el valor por kilo requiere contenido neto verificable. Las variaciones siempre identifican si comparan snapshots de referencia o períodos efectivos equivalentes. La serie de snapshots es append-only y una alerta efectiva exige volumen y días de venta mínimos.

En v0.5.8 el catálogo llega a la versión 1.6.0 e incorpora `recommendation.client_product_fit`. El puntaje ordena pares cliente-producto y no sustituye la señal O del cliente ni representa probabilidad de venta. Afinidad descriptiva, adopción comparable, inventario y rotación permanecen como componentes visibles; stock positivo y compatibilidad son condiciones de entrada. Los sustitutos exigen uso y presentación compatibles. La confianza describe la calidad de evidencia y ninguna recomendación crea una tarea o gestión.

En v0.5.9 la clasificación de inventario sigue calculándose exclusivamente desde el snapshot GESI, mientras que su ciclo humano se conserva en `operations.sqlite`. `inventory_alert_reviews` representa el estado vigente; `inventory_alert_review_events` registra de forma append-only revisiones guardadas, resoluciones y reaperturas. Una incidencia se resuelve cuando desaparece su familia de alerta y se reabre cuando reaparece después de esa resolución o cambia a una familia distinta. Oscilaciones dentro de la misma familia no generan trabajo nuevo. Estos estados operativos no alteran stock ni cifras de GESI.

En v0.6.0 el catálogo pasa a 1.6.2 sin crear nuevas métricas. C, O y P mantienen fórmulas y escalas separadas; sólo se actualizan sus consumidores para incluir `Bandeja comercial`. La bandeja ordena vencidos, bloqueos y P mediante precedencias visibles, no mediante un cuarto puntaje. `nextVisitAt` se presenta como revisión sugerida y no como planificación. Las notas humanas se guardan por separado y no cambian ninguna señal. O se conserva como cálculo auditable, pero deja de mostrarse como oportunidad operativa cuando el cliente está inactivo, tiene bloqueo de ventas o no registra compras positivas en los últimos 90 días; esos clientes pueden seguir visibles por motivos de cobranza.

En v0.6.5 el catálogo permanece en 1.6.2: la nueva lista `Oportunidades` de la ficha del cliente sólo presenta actividades humanas que ya conservan un `productId`. No agrega métricas, estados ni inferencias. La lectura de carteras y el seguimiento de objetivos continúan reutilizando C, O, P, ventas, resultados y objetivos ya definidos.

En v0.4.0 el catálogo llega a la versión 1.2.0 con 20 métricas. El Explorador de ventas agrega `sales.documents`, `sales.average_ticket` y `sales.average_price_kg` sobre el mismo universo ejecutable de Ventas · Comercial. `target.monthly` ya no lee una constante en memoria: toma la única versión activa de `operations.sqlite`, mientras resultados, cumplimiento y proyección continúan calculándose desde GESI.

Umbrales predeterminados:

- hasta 24 horas: foto actual;
- más de 24 horas: revisar actualización;
- más de 48 horas: datos desactualizados.

Pueden ajustarse con `SALICE_FRESHNESS_WARNING_HOURS` y `SALICE_FRESHNESS_STALE_HOURS`, sin incluir secretos.
