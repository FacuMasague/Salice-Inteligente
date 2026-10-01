# Auditoría de cobertura comercial: fechas ISO

El refresh de Render del 1 de octubre de 2026 reconstruyó el histórico, pero se detuvo en `sales-audit`: `coverageStartsIn2025` comparaba `2025-01-01T00:00:00.000Z` contra `2025-01-01` como texto. El sufijo ISO provocaba un rechazo incorrecto. El bundle anterior permaneció activo.

La auditoría ahora valida la fecha y compara el día documental, igual que la consulta de captura. Aplica también al primer movimiento. Las fechas ausentes o malformadas se rechazan. No se modifican las fuentes, los datos operativos, los demás controles ni la activación atómica de bundles.

Verificación local: 457 pruebas aprobadas, 7 omitidas y compilación aprobada. La prueba de integración ejecuta el CLI real sobre SQLite temporal: acepta el ISO exacto de Render y sigue rechazando cobertura posterior, vacía, septiembre ausente, continuidad antigua y otra empresa.

La verificación de producción debe confirmar despliegue, auditorías completas y cambio del bundle activo; las pruebas locales no sustituyen esa comprobación.
