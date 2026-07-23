# Salice Inteligente v0.5.6 · Demanda y rotación histórica

## Objetivo

Extender la inteligencia de productos desde la foto reciente de inventario hacia una lectura histórica reproducible. La versión permite reconocer aceleración, caída, estabilidad, productos recién observados y ausencia de demanda sin generar pronósticos opacos.

## Fuente y universo

- Fuente operativa: tabla `movements` de la base comercial del paquete activo, construida exclusivamente desde facturas, notas de crédito y maestros de la API GESI.
- Universo: productos del catálogo operativo vigente de Salice, empresa 3 y sucursal 3.
- Fecha de corte: máximo `sale_date` declarado por la base activa.
- Cobertura activa al desarrollar esta versión: 30/12/2024 a 22/07/2026; `coverage_from` declara 29/12/2024.
- PBIX no participa del cálculo.

La base histórica puede incluir artículos que ya no pertenecen al catálogo operativo. Esos artículos no se agregan silenciosamente a la vista; las dimensiones se calculan para los productos presentes en el catálogo vigente.

## Ventanas equivalentes

Las opciones son 30, 90 y 180 días inclusivos. Si el corte es 22/07/2026:

- 30 días: 23/06/2026–22/07/2026 contra 24/05/2026–22/06/2026;
- 90 días: 24/04/2026–22/07/2026 contra 24/01/2026–23/04/2026;
- 180 días: 24/01/2026–22/07/2026 contra 28/07/2025–23/01/2026.

No se usan meses calendario ni períodos de diferente cantidad de días.

## Métricas

### Demanda observada

`SUM(units)` sobre facturas con `units > 0` y detalle disponible. Las notas de crédito se conservan en la base comercial, pero no se interpretan como demanda negativa.

### Compradores

`COUNT(DISTINCT client_id)` dentro de la dimensión y período. Al agrupar por marca, familia o grupo se recalcula el conjunto de clientes; no se suman compradores de productos.

### Rotación comparable

`unidades de la ventana / días de la ventana × 30`. Esta normalización permite leer las tres ventanas en una escala mensual común, sin convertir unidades entre productos.

### Variación

`(unidades actuales - unidades anteriores) / unidades anteriores × 100`.

- aceleración: +20% o más;
- caída: -20% o menos;
- estable: entre ambos umbrales;
- base anterior cero: no se inventa un porcentaje.

### Estabilidad

La ventana actual se divide en tres bloques iguales: 10, 30 o 60 días. Se calcula `desvío estándar / promedio` sobre sus unidades.

- estable: coeficiente hasta 0,35 y al menos dos bloques activos;
- variable: mayor a 0,35 y hasta 0,75;
- intermitente: mayor a 0,75 o menos de dos bloques activos;
- sin base: cero unidades en los tres bloques.

El coeficiente describe regularidad histórica, no pronostica demanda futura.

## Productos nuevos y cobertura

GESI no aporta una fecha confiable de alta del maestro. Por eso la aplicación usa `Nuevo observado`, que exige:

1. demanda positiva actual;
2. demanda anterior igual a cero;
3. primera venta disponible dentro de la ventana actual;
4. cobertura completa del período anterior equivalente.

La etiqueta no afirma que el producto haya sido creado en esa fecha. Cuando la base no cubre la ventana actual o la comparación anterior completa, el estado es `Historia insuficiente`. Cuando la cobertura sí alcanza y no existen unidades actuales, el estado es `Sin demanda`.

## Dimensiones y navegación

- Producto: abre la ficha completa.
- Marca: abre el directorio y desempeño de la marca.
- Familia/rubro: abre el catálogo filtrado.
- Grupo: abre el catálogo con el grupo buscado.

La tabla admite búsqueda, filtros por evolución y estabilidad, paginación y orden ascendente, descendente y original en las columnas relevantes.

## Límites

- Las dos facturas sin detalle conocidas no pueden atribuirse a productos.
- U1 depende de la unidad primaria declarada por cada maestro; no se suman productos como si fueran una unidad física homogénea para tomar decisiones de reposición.
- La versión no pronostica ventas, no recomienda cantidades de compra y no infiere estacionalidad.
- Los importes secundarios provienen de los renglones de facturas de la base comercial; el indicador principal de demanda es U1.
- No se modifican móvil ni tutorial.

## Verificación requerida

- pruebas puras de cortes, cobertura, tendencia y estabilidad;
- pruebas SQLite de producto, marca, compradores únicos y entidades sin demanda;
- comprobación real de las tres ventanas y cuatro dimensiones;
- navegación contextual;
- encabezado fijo y desplazamiento horizontal de tabla;
- suite completa, build y auditorías vigentes;
- revisión visual de escritorio y consola del navegador.
