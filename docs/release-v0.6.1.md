# Salice Inteligente v0.6.1 · Lectura administrativa de carteras

## Objetivo

Mejorar la lectura diaria de las carteras comerciales desde la oficina sin convertir el sistema en un planificador de dotación. La versión reúne clientes activos, ventas, localidades observadas y C/O/P por vendedor.

No incorpora reasignaciones, territorios inferidos, simuladores, comunicaciones ni tareas automáticas.

## Universo

- Participan únicamente clientes activos en GESI.
- La comparación incluye `Sin vendedor` para que ningún cliente activo quede oculto. Esta fila informa la falta de responsable, pero no propone uno.
- La pertenencia confirmada a Salice y los clientes a revisar permanecen visibles y separados.
- Ventas, última compra, saldos y puntajes provienen del snapshot activo.

## Comparación de carteras

Por cada vendedor se muestran:

- clientes activos;
- ventas positivas observadas en 90 días;
- cantidad de localidades informadas;
- clientes con riesgo de cobranza alto, correspondiente a C55 o superior;
- clientes comercialmente elegibles con oportunidad alta, correspondiente a O55 o superior;
- clientes con prioridad alta, correspondiente a P55 o superior.

C, O y P conservan fórmulas, escalas y significados independientes. Los conteos sólo agrupan condiciones visibles; no forman otro puntaje.

## Localidades

La distribución utiliza `client.locality` del maestro GESI. Agrupa diferencias de mayúsculas y espacios, sin corregir ni geocodificar nombres dudosos. Cada localidad resume clientes, ventas y cantidades con C/O/P altos.

La pantalla aclara expresamente que una localidad no equivale a un territorio. No se usan coordenadas para inventar zonas y no se proponen cambios de vendedor.

## Orden y filtros

- El orden original de las carteras usa ventas de 90 días descendentes para facilitar la comparación de escala.
- Todos los encabezados permiten recorrer orden descendente, ascendente y original, con una flecha que indica el estado vigente.
- Dentro de cada cartera, los clientes se ordenan siempre por P descendente, luego C y finalmente nombre.
- Los filtros `Riesgo de cobranza`, `Oportunidad alta` y `Prioridad alta` reducen la lectura sin cambiar el orden.
- La lista `Cartera para revisar` muestra P como señal de prioridad y no presenta C en cada fila.
- La Bandeja comercial adopta también el orden P descendente para todos sus clientes, por decisión funcional de Salice.

Los filtros no crean tareas, notas, comunicaciones, asignaciones ni estados de seguimiento.

## Contratos

- `shared/portfolio-analysis.ts`: universo activo, umbrales, agregaciones por vendedor y localidad, filtros y orden.
- `src/views/SellersView.tsx`: comparación y detalle administrativo.
- `src/lib/sorting.ts`: ciclo descendente, ascendente y original de la tabla comparativa.
- `server/agenda.ts`: orden P descendente en la Bandeja comercial.

## Limitaciones

- GESI no entrega un maestro de zonas confiable.
- No se infiere territorio desde coordenadas o localidad.
- La lectura no evalúa capacidad, carga horaria ni disponibilidad de cada vendedor.
- No se permite reasignar clientes ni guardar escenarios.
- No se agregó autenticación, experiencia móvil, hosting ni actualización nocturna.
- El tutorial permanece sin cambios por decisión expresa.

## Validación

- Suite completa: 177 pruebas aprobadas, 7 conciliaciones históricas omitidas de forma explícita y 0 fallas.
- Build de TypeScript y Vite correcto.
- Auditoría de datos: 0 problemas.
- Integridad de `operations.sqlite`: correcta sobre 19 tablas.
- Auditoría de plataforma: 23 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de cobertura o calidad de GESI.
- Auditorías SPT, de vectores y de precios aprobadas.
- Verificación sobre el snapshot activo: 1.916 clientes activos distribuidos en 19 carteras visibles, incluidos 395 clientes `Sin vendedor`.
- Revisión visual de escritorio: comparación de carteras, orden triestado, filtros con nombres administrativos, orden P del detalle y resumen compacto de localidades sin desborde horizontal propio de la vista.
