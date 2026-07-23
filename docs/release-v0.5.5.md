# Comparador operativo de productos · v0.5.5

## Objetivo

Reemplazar la comparación técnica de dos productos por una herramienta de oficina capaz de contrastar entre dos y cuatro artículos, mantener la selección durante la navegación y explicar cuándo dos productos se parecen sin presentarlos automáticamente como sustitutos.

## Selección

- buscador por nombre, SKU, marca, rubro, línea y presentación;
- agregado desde el catálogo, la ficha y las alternativas comerciales;
- sugerencias ordenadas por uso, clasificación y presentación;
- cambio o eliminación de cualquier columna sin reiniciar;
- máximo de cuatro productos y primer artículo como referencia;
- selección conservada en el estado de la aplicación y en `localStorage`;
- apertura de una ficha desde la comparación sin abandonar la sección ni perder filtros.

## Presentación

La tabla posee encabezado fijo dentro de su propio desplazamiento y ocho bloques:

1. identidad y clasificación;
2. presentación y contenido;
3. precio y precio por kilo;
4. stock, rotación y cobertura;
5. ventas y compradores;
6. características principales;
7. compatibilidades e incompatibilidades;
8. calidad de los datos.

`Mostrar sólo diferencias` elimina filas iguales de la vista, sin alterar los productos. Cada valor conserva su unidad y las conclusiones se expresan en lenguaje normal.

## Comparabilidad y ventajas

- precio total: sólo es comparable con presentaciones equivalentes;
- precio por kilo: exige peso neto inequívoco y mismo uso principal;
- stock, rotación y unidades: sólo se resaltan con U1 y presentaciones equivalentes;
- cobertura: exige stock, rotación y calidad de inventario utilizables en todos los productos;
- venta y compradores: comparten la ventana de 90 días y permiten señalar el mayor valor observado;
- filas sin comparabilidad siguen visibles y explican la limitación.

Una ventaja significa exclusivamente mejor valor dentro de esa fila comparable. No constituye una recomendación de compra, calidad nutricional ni reposición.

## Conclusiones separadas

Cada alternativa se contrasta con el producto base mediante:

- compatibilidad de uso;
- clasificación comercial;
- presentación;
- posicionamiento de precio;
- comportamiento comercial;
- confianza de los datos.

La conclusión distingue una alternativa cercana de un artículo relacionado que no es sustituto directo. Especie, etapa, tipo o presentación incompatibles permanecen explícitos.

## Detalle técnico

Las 33 dimensiones vectoriales no ocupan la superficie habitual. Permanecen detrás de `Ver detalle vectorial técnico`, con porcentajes exactos por producto para auditoría.

## Validación

- pruebas determinísticas del comparador compartido;
- selección, reemplazo, eliminación y agregado desde catálogo verificados en la aplicación real;
- apertura y cierre de ficha conservando selección y filtro de diferencias;
- ocho bloques y seis dimensiones presentes;
- encabezado de tabla verificado como `sticky` dentro de un contenedor desplazable;
- consola del navegador sin errores ni advertencias;
- suite completa: 138 pruebas aprobadas, 7 conciliaciones históricas omitidas explícitamente y 0 fallas;
- build de producción: correcto;
- auditoría de datos: 0 problemas;
- integridad de operaciones: correcta sobre 17 tablas;
- auditoría de plataforma: 23 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de GESI;
- auditoría vectorial: aprobada sobre 2.156 productos, con 1.906 perfiles con señal y 250 vacíos conservados;
- tutorial y experiencia móvil sin cambios, según el alcance acordado.
