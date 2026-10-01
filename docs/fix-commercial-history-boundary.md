# Continuidad del histórico comercial · 2026-10-01

La actualización del 1 de octubre falló en `sales-audit`: `all2025MonthsPresent=false`, al desaparecer septiembre de 2025. El paquete activo del 29 de septiembre conservaba sólo 1.182 renglones de ese mes, todos del día 30; el raw candidato ya no contenía ninguna factura de septiembre.

La captura consultaba GESI desde la fecha anual con la hora de ejecución (por ejemplo, `2025-09-30T06:00:46.500Z`), pero descartaba del histórico todas las filas cuya fecha de emisión era igual o posterior al día del corte. GESI informa esas emisiones a medianoche: las filas del primer día no entraban ni en el histórico conservado ni en la nueva consulta. Al avanzar el corte, el error eliminaba un día por vez.

La comparación de sólo lectura en Render confirmó que, hasta el 1 de octubre de 2025, consultar desde `2025-09-30T00:00:00.000Z` devolvía 256 cabeceras (208 del 30 de septiembre y 48 del 1 de octubre). Desde las 06:00 devolvía sólo las 48 de octubre. La fuente sigue ofreciendo septiembre: anunció 2.422 cabeceras en una consulta mensual y una consulta individual de muestra devolvió detalle válido de empresa 3 / sucursal 3.

## Corrección y recuperación

- Todas las consultas documentales normalizan el inicio al comienzo del día, igual que la regla de conservación histórica.
- Las capturas anteriores reconstruyen el histórico completo desde el inicio configurado (por defecto enero de 2025, o una cobertura anterior ya declarada). No basta con corregir el próximo día: hay que recuperar los días previamente perdidos.
- La captura registra `sptHistoryContinuityVersion=1` cuando la consulta de detalles cubre el rango. Sólo una captura aprobada con esa versión permite volver a la actualización incremental.
- La base comercial registra esa evidencia y la auditoría la exige. La presencia de los doce meses, la unicidad, el alcance y el control de documentos sin detalle siguen siendo obligatorios. No se puede reanudar el raw antiguo para evitar la reconstrucción.

La primera actualización con el arreglo consulta más histórico y puede tardar más. Las siguientes vuelven a consultar el año móvil y conservan lo anterior. Se mantiene la activación atómica y la foto aprobada hasta completar todas las auditorías.

## Verificación

Pruebas de regresión: primer día de la consulta, partición sin pérdida ni duplicación entre histórico y fuente, reconstrucción de capturas antiguas/fallidas y rechazo de fechas inválidas. Las consultas de producción realizadas durante el diagnóstico fueron de sólo lectura. No se modificaron datos operativos ni se publicó un nuevo paquete durante el desarrollo.

- Suite completa: 432 pruebas aprobadas y 7 omitidas por la configuración existente (89 archivos aprobados, 1 omitido).
- `pnpm run build` y comprobación final `tsc --noEmit`: aprobados.
- Flujo sintético con base temporal y doce meses: la captura con versión 1 aprueba; la misma captura con versión 0 falla únicamente en `historyUsesCompleteBoundaryDays`.
- `git diff --check`: aprobado. `origin/main` seguía en `4223aa8` al finalizar la verificación.
