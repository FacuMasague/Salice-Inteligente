# Salice Inteligente v1.1.1

## Productos y kilos

- Los kilos vendidos se estiman como unidades U1 vendidas por contenido neto en kilos de cada U1.
- El contenido se toma de la relación de unidades del maestro cuando está disponible o de una presentación inequívoca.
- Los productos cuya presentación no permite una conversión permanecen identificados y no aportan kilos a los totales.
- La misma regla se aplica al catálogo, la ficha, demanda y rotación, Marcas y los resúmenes de fojas.

## Precios

- La ficha separa el precio del producto del precio propio por kilo.
- La referencia de competencia es la mediana por kilo de otros productos comparables del catálogo.
- La comparación exige misma especie, tipo de alimento y banda de presentación; no representa un relevamiento externo.
- Cuando no existe una cohorte suficiente, la interfaz muestra que no hay referencia competitiva.

## Objetivos comerciales

- Se retiró la ventana independiente de Objetivos comerciales y su acceso en Administración.
- El Reporte General conserva objetivos, resultados, cumplimiento y exportaciones en una sola experiencia.
- La persistencia versionada del plan se conserva para no alterar los cálculos determinísticos ni el histórico.

## Compatibilidad

La revisión del snapshot permanece en 11. Los nuevos campos competitivos son opcionales y los snapshots v1.1.0 siguen siendo legibles. Una actualización posterior reconstruye las estimaciones con la nueva regla.
