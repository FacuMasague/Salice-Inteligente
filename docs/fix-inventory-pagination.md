# Recuperación de existencias omitidas por paginación · 2026-10-01

## Evidencia

Render ejecutaba `6fae185`. La captura de las 18:00 UTC completó la reconstrucción comercial (`sptHistoryContinuityVersion=1`), pero falló en `capture-audit`: 13.496 maestros frente a 13.491 existencias normalizadas. Faltaban cinco códigos: CHPRPC150, VGA005, VGA200, VGK150 y VMA030. El manifiesto activo no fue reemplazado.

La consulta general había anunciado un total suficiente, pero repitió cinco filas. Una lectura adicional con páginas de 500 recuperó los cinco códigos y mostró cantidades físicas no nulas; sin embargo, repitió otros códigos (13.497 filas y 13.450 identificadores únicos). Cambiar el tamaño de página no garantiza completitud.

El manual GESI, páginas 47–49, documenta `codigos` en `Productos/GetExistencias`. Una lectura por esos cinco códigos devolvió exactamente cinco filas de empresa 3, sucursal 3 y almacén 2. Incluían disponibilidad y pedidos pendientes distintos de cero; no corresponde completar ausencias con ceros.

## Corrección

Antes de consultar el histórico, la captura compara el maestro con las existencias normalizadas. Consulta los códigos faltantes en lotes de hasta 40 mediante el endpoint documentado, manteniendo los filtros de sucursal, almacén e inclusión de ceros. Conserva las cantidades de la fuente, verifica el alcance y rechaza respuestas incompletas, ajenas, conflictivas o con cantidades ausentes. No reutiliza stock anterior para completar faltantes.

La captura guarda los códigos recuperados y la auditoría los informa. Todos los controles existentes de cobertura, unicidad, alcance y cantidades permanecen. Si falla la recuperación se interrumpe antes de descargar el histórico y se conserva el paquete activo.

## Verificación y despliegue

Las pruebas de regresión cubren recuperación sin modificar cantidades, lotes, ausencia de consultas innecesarias y rechazo de respuestas incompletas o inválidas. La publicación debe seguirse de una actualización completa y de la comprobación de todas las auditorías y la activación del nuevo manifiesto; un despliegue de código por sí solo no demuestra la actualización de datos.

Verificación local: 442 pruebas aprobadas, 7 conciliaciones históricas omitidas por configuración existente; `pnpm run build` y `git diff --check` aprobados. La suite utilizó una base operativa temporal y actualizaciones automáticas deshabilitadas.
