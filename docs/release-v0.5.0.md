# Saneamiento de pruebas históricas · v0.5.0

## Objetivo

La versión elimina el acoplamiento accidental entre las pruebas de reportes y el snapshot activo. Las 19 fallas conocidas provenían de comparar la captura vigente con fechas, totales y filas fijados al 20/07/2026.

## Cambios

- Los siete archivos afectados validan contratos estables sobre el paquete activo: universos, filtros, cortes equivalentes, composición y sumas internas.
- `server/report-contracts.synthetic.test.ts` prueba seis motores de reporte sobre bases temporales pequeñas sin datos reales.
- `server/test-fixtures/reconciliation-2026-07-20.json` identifica las cifras testigo con fecha, revisión y checksums de sus bases de origen.
- `server/historical-report-reconciliation.test.ts` ejecuta siete conciliaciones sólo cuando encuentra exactamente ese paquete histórico.
- `pnpm run test:reconciliation` permite solicitar esa comprobación de forma aislada.
- `docs/testing-and-reconciliation.md` documenta la arquitectura y el alta segura de futuros fixtures.

No se modificaron consultas, métricas, universos ni resultados productivos. Tampoco se versionaron snapshots, SQLite o datos sensibles.

## Verificación

- suite completa: 34 archivos y 118 pruebas aprobadas;
- conciliación histórica del 20/07: 7/7 aprobadas contra los checksums versionados;
- contratos sintéticos: 6/6 aprobados sin datos reales;
- siete suites activas: 29/29 aprobadas contra los paquetes del 20/07, 21/07 y 22/07;
- TypeScript y build de Vite correctos;
- auditoría de datos: 0 problemas;
- integridad de `operations.sqlite`: correcta;
- auditoría de plataforma: 19 controles requeridos aprobados, sin fallas, y 4 advertencias conocidas de cobertura GESI;
- auditoría SPT: aprobada, con grano único y 2 comprobantes sin detalle declarados.

No se requirió revisión visual: la entrega no modifica componentes, estilos, navegación ni contratos de la interfaz.
