# 005 · Reporte Baires

## Propósito

Seguimiento comercial de Baires dentro de Salice: kilos vendidos, clientes alcanzados, evolución mensual, comparación interanual, trimestres y composición por marca y subrubro.

Archivo de referencia: `Reporte Baires.pbix`, revisado el 20/07/2026. El PBIX se usa únicamente para relevar medidas, filtros, disposición y cifras testigo; la ventana operativa consulta la base analítica construida desde la API GESI.

## Estructura observada

El reporte tiene una única página, `Baires`, con:

- seis tarjetas para kilos y clientes del mes, mes anterior y año anterior;
- volumen mensual de los últimos 13 meses;
- porcentaje YTD contra el mismo corte del año anterior;
- volumen por trimestre del año actual;
- clientes únicos por mes.

Filtros de usuario: Mes, Marca, segmento Baires (`Especializado` / `Masivo`), Subrubro y Sucursal.

## Filtros publicados

- Página: `GrupoArtDescrip` es `Baires SPT` o `Baires Masivo`.
- Todas las páginas: `Rubro != POP`.
- Todas las páginas: `Cliente != Via Salice MDP S.A.`.
- Marca: sin restricción global.

Agrupación del segmento:

- `Baires SPT` → `Especializado`.
- `Baires Masivo` → `Masivo`.

El PBIX agrupa las sucursales 3 y 6 como Mar del Plata y la 4 como Córdoba. La implementación web está deliberadamente restringida al universo Salice disponible en GESI: empresa 3, sucursal 3 y emisor `Salice Distribuciones S.A.`. Por eso la opción operativa actual de sucursal es Mar del Plata.

## Medidas reconstruidas

- Total de kilos: suma neta de `Kilos`, incluyendo notas de crédito con signo.
- Clientes: cantidad distinta de `ClienteID`.
- Mes anterior comparable: mismo número de días cuando el mes seleccionado está en curso.
- Año anterior comparable: mismos días del mismo mes del año anterior.
- YTD: desde el 1 de enero hasta el cierre o fecha de corte.
- YTD año anterior: mismo corte calendario del año anterior.
- Evolución: últimos 13 meses disponibles, independiente del selector de mes pero afectada por los filtros comerciales.
- Trimestres: año seleccionado completo hasta la última fecha disponible.

## Cifras testigo

La vista abierta en Power BI tenía mayo de 2026, ambos segmentos, todas las marcas, subrubros y sucursales. GESI empresa 3 / sucursal 3 reproduce exactamente:

- Mayo 2026: 143.158 kg y 430 clientes.
- Abril 2026: 112.026 kg y 417 clientes.
- Mayo 2025: 433 clientes.

El PBIX informa 117.085 kg para mayo de 2025; GESI operativo entrega 116.838,5 kg. En trimestres, el PBIX muestra 398.044,5 / 389.871,5 / 70.906 kg y GESI entrega 397.857 / 389.862,5 / 70.886 kg. Las diferencias son pequeñas y compatibles con movimientos históricos ajustados en el SQL de referencia y con tres comprobantes cuyo detalle la API no entregó. La web conserva el valor GESI y declara la salvedad, sin completarlo artificialmente desde el PBIX.

Para el corte predeterminado —julio 2026 al día 20, ambos segmentos— GESI informa 70.886 kg, 350 clientes y 858.605,5 kg YTD.

## Reemplazo web

La v0.2.6 agrega `Reportes → Reporte Baires` con:

- filtros de año, mes, segmento, marca, subrubro y sucursal;
- seis KPI con comparaciones equivalentes;
- gráfico interactivo de 13 meses y avance YTD;
- gráfico interactivo de clientes;
- volumen trimestral;
- tablas ordenables por marca y subrubro;
- fecha de corte, universo y cobertura de fuente visibles.

La pantalla mantiene la identidad visual verde/azul/ocre de Salice y no reproduce la paleta amarilla del PBIX.

Endpoints: `GET /api/reports/baires/meta` y `GET /api/reports/baires`.

## Experiencia común v0.8.6

Baires comparte con Mars y NutriPet la estructura visual de filtros, período, indicadores, carga y fuente. Conserva la segmentación, filtros, dimensiones, universo y métricas propias.
