# Salice Inteligente v0.6.5 · Oportunidades visibles en gestiones

## Objetivo

Hacer visible en la ficha del cliente el resultado mínimo de vincular una nota con una oportunidad de producto y ubicar Cartera dentro del grupo administrativo correcto.

## Gestiones del cliente

La pestaña `Gestiones` incorpora una lista `Oportunidades`.

- Participan únicamente actividades humanas que contienen uno o más productos vinculados.
- Cada registro muestra la nota, la fecha y el producto relacionado.
- El producto es navegable y abre la ficha de producto existente.
- Las actividades vinculadas no se duplican dentro de `Notas sobre hechos externos`.
- Si un producto histórico ya no está disponible en el catálogo operativo, se conserva su identificador sin inventar información.

Esta presentación reutiliza `commercial_activities.product_ids_json`. No crea una segunda nota, una gestión, una tarea, un contacto, un estado o una etapa comercial.

## Navegación

`Cartera` se mueve de `Centro operativo` a `Administración` en el menú lateral. La pantalla, sus filtros, métricas, universos y alertas no cambian.

## Límites

- La nota continúa siendo una declaración humana sobre algo ocurrido fuera del sistema.
- Vincularla con un producto no demuestra que haya existido contacto u oferta.
- No se agregan comunicaciones, campañas ni workflow.
- No se modifica el tutorial.

## Validación

- 180 pruebas aprobadas, 7 conciliaciones históricas omitidas explícitamente y 0 fallas.
- Build de TypeScript y Vite correcto.
- Auditoría de datos: 0 problemas.
- Integridad de `operations.sqlite`: correcta sobre 20 tablas.
- Auditoría de plataforma: 23 controles obligatorios aprobados, 0 fallas y 5 advertencias conocidas de GESI.
- Revisión visual aislada: nota visible una sola vez en `Oportunidades`, navegación correcta a la ficha del producto y `Cartera` ubicada únicamente en `Administración`.
