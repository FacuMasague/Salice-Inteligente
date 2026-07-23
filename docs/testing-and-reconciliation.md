# Pruebas y conciliaciones históricas

## Separación de responsabilidades

La suite mantiene tres capas deliberadamente distintas:

1. **Contratos estables:** ejecutan los reportes contra el paquete activo y validan fuente, universo, filtros, cortes temporales y reconciliaciones internas. No esperan totales que cambian con cada captura.
2. **Fixture sintético:** `server/report-contracts.synthetic.test.ts` crea dos bases SQLite temporales pequeñas, sin datos reales, y comprueba resultados determinísticos. Las bases se eliminan al terminar.
3. **Conciliación histórica:** `server/historical-report-reconciliation.test.ts` compara cifras testigo únicamente con el paquete que coincide en fecha, revisión y checksum con `server/test-fixtures/reconciliation-2026-07-20.json`.

Los archivos SQLite, snapshots y bases operativas siguen ignorados por Git. El fixture versionado contiene sólo metadatos, checksums y agregados ya documentados; no contiene credenciales, movimientos ni información identificable adicional.

## Clasificación de la deuda original

La línea base de v0.4.4 contenía 19 fallas en siete archivos:

| Suite | Fallas | Acoplamiento encontrado |
|---|---:|---|
| Reporte General | 3 | kilos, facturación y vendedor fijados al corte histórico |
| Ventas · Comercial | 3 | fecha máxima, día de corte y cierre anual fijados al 20/07 |
| Reporte Mars | 3 | fecha, kilos P07 y días transcurridos P08 |
| Reporte NutriPet | 2 | cantidad de movimientos y días del último mes |
| Reporte Baires | 3 | cantidad de movimientos, días del mes y trimestres históricos |
| Cuentas no compradoras | 2 | fecha de corte y distribución histórica por vendedor |
| Saldos Pendientes | 3 | fecha, totales de Edgardo y filas de clientes concretos |

No se identificó una regresión productiva común detrás de esas fallas: las 86 pruebas restantes ya aprobaban sobre el snapshot nuevo. Los valores exactos se trasladaron a la capa histórica; las relaciones de negocio permanecen en los contratos activos.

## Ejecución

La suite completa se ejecuta con:

```bash
pnpm test
```

Si el paquete histórico no está disponible, la conciliación correspondiente se informa como omitida; los contratos activos y sintéticos continúan ejecutándose. Para solicitar únicamente la conciliación histórica:

```bash
pnpm run test:reconciliation
```

El fixture del 20/07/2026 exige ambos artefactos exactos:

- base comercial SHA-256 `e48befc3063d471c47c30b3119fa75e4b020a02cb05d5bd6f7d2b70d3b704688`;
- base de saldos SHA-256 `f1961b10e8a6e6e20d63a5071d860a425b27a97bb98f17093160e8d7ff3ada19`.

Una base con otra fecha o checksum nunca se usa para afirmar que reproduce esas cifras.

## Cómo agregar una conciliación

1. Conservar el paquete aprobado fuera de Git según la política de datos.
2. Registrar un nuevo JSON en `server/test-fixtures/` con identificador, `capturedAt`, revisión, checksums y agregados testigo.
3. Documentar universo, fuente, corte y motivo de cada testigo en `docs/powerbi/` o en la nota de versión correspondiente.
4. Agregar una suite que resuelva el paquete por metadatos y checksums, nunca por “paquete activo”.
5. Mantener fuera del fixture nombres de clientes, comprobantes, credenciales y filas operativas, salvo que exista una razón explícita y una revisión de seguridad.
6. Ejecutar el fixture contra su paquete de origen y comprobar que también queda omitido frente a un paquete distinto.

## Qué debe probar cada capa

Los contratos activos verifican relaciones que deben mantenerse aunque cambien los movimientos:

- las fechas y ventanas se derivan del corte publicado;
- los desgloses suman al indicador correspondiente cuando sus universos son equivalentes;
- los filtros reducen o conservan el universo según su semántica;
- notas de crédito y documentos vencidos mantienen su signo y clasificación;
- cuentas, sucursales y entidades distintas no se intercambian;
- objetivos planificados permanecen separados de resultados GESI.

Las cifras exactas de una fecha se conservan sólo como evidencia de conciliación. Actualizar GESI no autoriza a reemplazar silenciosamente esos números ni a modificar algoritmos para reproducirlos.
