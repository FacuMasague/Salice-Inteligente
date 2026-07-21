# Catálogo central de métricas y datos · v0.3.0

La fuente ejecutable del catálogo es `shared/metrics.ts`. La misma definición se publica en `GET /api/metrics/catalog` y se presenta en Configuración. Este documento explica el contrato de mantenimiento; no reemplaza a las fichas particulares de `docs/powerbi`.

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

Umbrales predeterminados:

- hasta 24 horas: foto actual;
- más de 24 horas: revisar actualización;
- más de 48 horas: datos desactualizados.

Pueden ajustarse con `SALICE_FRESHNESS_WARNING_HOURS` y `SALICE_FRESHNESS_STALE_HOURS`, sin incluir secretos.
