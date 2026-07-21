# Catálogo central de métricas y datos · v0.4.0

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

La auditoría también verifica el manifiesto activo, los contratos ejecutables, la auditoría vectorial y `integrity_check` de la persistencia operativa.

En v0.4.0 el catálogo llega a la versión 1.2.0 con 20 métricas. El Explorador de ventas agrega `sales.documents`, `sales.average_ticket` y `sales.average_price_kg` sobre el mismo universo ejecutable de Ventas · Comercial. `target.monthly` ya no lee una constante en memoria: toma la única versión activa de `operations.sqlite`, mientras resultados, cumplimiento y proyección continúan calculándose desde GESI.

Umbrales predeterminados:

- hasta 24 horas: foto actual;
- más de 24 horas: revisar actualización;
- más de 48 horas: datos desactualizados.

Pueden ajustarse con `SALICE_FRESHNESS_WARNING_HOURS` y `SALICE_FRESHNESS_STALE_HOURS`, sin incluir secretos.
