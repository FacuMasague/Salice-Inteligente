# Vectorización de productos v2.2 · v0.5.4

## Objetivo

Mejorar la cobertura descriptiva del catálogo sin convertir rotación, adopción o popularidad en atributos del producto, y permitir que la oficina corrija casos concretos sin alterar el algoritmo ni perder el ajuste en la próxima actualización.

## Motor v2.2

- amplía variantes observadas de especie, etapa y necesidades específicas;
- interpreta negaciones y evita convertir ausencias declaradas en señales positivas;
- registra combinaciones explícitas de especie, etapa y porte para no auditarlas como contradicciones;
- distingue porte de mascota, contenido neto y tamaño del envase;
- prioriza rubro, línea y unidades estructuradas cuando son utilizables;
- corrige el rubro heredado de Drovet, que podía convertir fármacos o instrumental en alimento seco;
- conserva las 33 dimensiones y mantiene fuera del vector las métricas comerciales dinámicas.

La inferencia sigue siendo determinística. Una ausencia de evidencia permanece en cero.

## Comparación antes de activar

`pnpm run compare:vectors` comparó v2.1 y v2.2 sobre los 2.156 productos del corte del 22/07/2026:

- productos con alguna señal: 1.857 → 1.906;
- perfiles vacíos: 299 → 250;
- contradicciones no declaradas: 1 → 0;
- 331 productos cambiaron en al menos una dimensión o peso reconocido;
- doce presentaciones adicionales fueron reconocidas al comparar la lectura anterior con la regla v2.2, incluyendo relaciones U2/U1 estructuradas;
- el criterio automático de activación fue aprobado.

La auditoría del snapshot v2.2 informa 1.906 perfiles con señal, 250 vacíos, 19 combinaciones explícitas, 244 perfiles de confianza menor a 45, 443 precios por kilo y una presentación de alimento seco todavía sin peso reconocible. Esos casos se mantienen visibles para revisión.

## Correcciones humanas

Desde `Ver análisis técnico`, una persona puede fijar un valor entre 0 y 100 para una dimensión, con motivo obligatorio. La persistencia registra producto, dimensión, valor, motivo, fecha y autor, y agrega un evento append-only en cada ajuste o reversión.

Las correcciones se superponen al snapshot al leerlo y sobreviven a nuevas capturas. Revertir una corrección restaura el resultado algorítmico actual. La IA no puede guardar ajustes automáticamente.

## Revisión de inventario

El selector de estado ofrece los tres valores completos: `No revisado`, `En revisión` y `Revisado`. Volver a `No revisado` no borra silenciosamente la nota ni la excepción humana.

## Datos y activación

Se reconstruyó el snapshot desde la captura cruda ya validada del 22/07/2026; no se consultó una captura nueva. El paquete `vectors-v2-2-20260722`, revisión 10, conserva las bases comercial y de saldos del mismo corte. El bundle anterior quedó preservado.

## Validación

- comparación v2.1 → v2.2: aprobada;
- suite completa: 131 pruebas aprobadas, 7 conciliaciones históricas omitidas explícitamente y 0 fallas;
- build de producción: correcto;
- auditoría de datos: 0 problemas;
- auditoría vectorial: 0 contradicciones no declaradas;
- integridad de operaciones: correcta sobre 17 tablas;
- auditoría de plataforma: 23 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de GESI.

Las advertencias conservadas son maestro de zonas no utilizable, dos facturas/comprobantes sin detalle, 560 clientes activos con pertenencia por revisar y 716 maestros sin unidad primaria.

El tutorial y la experiencia móvil quedan fuera de esta entrega, según el alcance acordado.
