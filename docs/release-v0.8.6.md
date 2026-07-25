# v0.8.6 — Reportes simplificados y mejor conectados

## Alcance

Esta versión reduce complejidad y duplicaciones en Reportes sin modificar las definiciones aceptadas ni crear una segunda capa de gestión.

- SPT muestra primero mes, vendedor, canal y grupo de artículos. Marca, categoría, producto y cliente quedan en `Más filtros`; línea, subcategoría, tipo de cliente, agrupación y localidad permanecen disponibles como criterios específicos.
- Producto y cliente dejan de aparecer dos veces en el formulario de SPT. Restablecer filtros también cierra los grupos avanzados.
- El contador de `Más filtros` considera sólo criterios que están dentro del bloque oculto, no vendedor, canal, sucursal, segmento u otros controles que ya están a la vista.
- Mars, NutriPet y Baires comparten componentes para filtros, período, indicadores, carga y fuente. Cada informe conserva su calendario, selección inicial, segmentación, métricas, dimensiones y universo.
- MTD, YTD y LY se reemplazan en la interfaz por `del mes`, `acumulado` y `año anterior`. También se eliminan referencias técnicas como `ClienteID`, `SQL` e `Infinity` de las explicaciones destinadas a la oficina.
- Se ajustan los anchos y nombres de encabezados de Mars y Saldos Pendientes para que no queden recortados.
- El Reporte General distingue explícitamente resultados reales de GESI y objetivos del plan mensual versionado. Un botón abre `Objetivos comerciales`, que continúa siendo el único lugar de administración.
- Saldos Pendientes conserva el resumen de deuda por vendedor, antigüedad y estado. La tabla operativa duplicada por cliente se retira; consulta, exportación y seguimiento continúan en `Cuentas por cobrar`.
- Los Excel conservan líneas de cuadrícula visibles, encabezados congelados, anchos suficientes y tipos numéricos, de fecha y porcentaje.

## Contratos preservados

- No cambian fórmulas, métricas, fuentes, períodos, calendarios, universos ni cifras de SPT, Mars, NutriPet, Baires, Reporte General o Saldos Pendientes.
- Los objetivos siguen separados de los resultados reales y mantienen versión, fuente y período.
- Reportes no registra cobranzas, notas ni gestiones; esas acciones permanecen en sus módulos operativos.
- No se modifican el snapshot, los datos de GESI ni el tutorial.

## Validación de oficina

La estructura queda preparada para una prueba breve con usuarios reales. Esa prueba debe confirmar que los nombres, explicaciones y tablas resultan claros en el trabajo cotidiano; los ajustes concretos que surjan se tratarán como correcciones de esta fase.

## Validación técnica

- 202 pruebas aprobadas y siete conciliaciones históricas omitidas únicamente porque su fixture exacto no está activo.
- Build de producción correcto.
- Auditoría de datos sin problemas e integridad correcta sobre 20 tablas operativas.
- Auditoría de plataforma: 25 controles aprobados, cero fallas obligatorias y cinco advertencias conocidas de cobertura de GESI.
- Auditorías de vectores y precios aprobadas.
- Revisión visual de SPT, Mars, NutriPet, Baires y Saldos Pendientes sin desbordes ni textos recortados; consola del navegador sin errores ni advertencias.
- Libros de Reportes y Cuentas por cobrar reabiertos con líneas de cuadrícula visibles, encabezados congelados, anchos explícitos y celdas numéricas conservadas.
