# Ficha administrativa de producto · v0.5.3

## Objetivo

Convertir Productos en una herramienta clara para la oficina. La superficie principal responde qué artículo es, cómo se vende, quién lo compra y qué ocurre con su inventario; la explicación vectorial completa permanece disponible sin dominar la consulta cotidiana.

## Datos prioritarios

La ficha presenta primero:

- nombre, SKU, marca, rubro/familia y presentación;
- precio de referencia y precio por kilo sólo cuando el contenido es inequívoco;
- stock U1 de empresa 3, sucursal 3 y depósito 2;
- rotación mensual y unidades de 90 días;
- clientes compradores únicos;
- venta atribuida de 90 días;
- última venta observada;
- clasificación de inventario compartida con la bandeja de v0.5.2.
- estado de revisión de oficina, nota completa, excepción y última actualización cuando existen.

La ficha no redefine stock, rotación, cobertura ni última venta. Consume las métricas compartidas de v0.5.1 y la precedencia de inventario de v0.5.2.

La presentación prioriza el embalaje explícito. Cuando éste sólo repite la unidad primaria, usa la relación positiva U2/U1 informada por GESI —por ejemplo, `15 KG por UN`— y recién después el contenido neto inequívoco reconocido; nunca fuerza una conversión ausente.

## Resumen comprensible

`summarizeProductForOffice` construye una oración desde afinidades positivas y auditables. Prioriza tipo de producto, especie, etapa de vida y posicionamiento. Si esas señales no existen, cae al rubro explícito de GESI; si tampoco existe, declara que el tipo no es verificable.

El resumen no usa IA, no completa ceros por exclusión y no convierte precio alto en calidad nutricional.

## Evolución comercial

Las compras normalizadas de 90 días se separan en tres ventanas consecutivas de 30 días:

1. días 90–61 respecto del corte;
2. días 60–31;
3. últimos 30 días, incluida la fecha del snapshot.

Cada banda suma venta atribuida, cantidad U1 y compradores únicos. La variación compara las dos bandas más recientes. Cuando la anterior vale cero, la interfaz muestra `Sin base comparable anterior` y no genera infinito ni un porcentaje ficticio.

Estas bandas son móviles, no meses calendario. Sólo incluyen facturas cuyo detalle positivo fue entregado por GESI.

## Compradores y navegación

El ranking suma por cliente los renglones del producto dentro de la ventana capturada y ordena por venta, unidades y nombre. La tarjeta muestra los siete principales; `Ver todos` abre una ventana con la lista completa, búsqueda por cliente o vendedor, última compra y cantidad de días con compra. Cada cuenta abre su perfil; marca y rubro/familia funcionan como navegación hacia sus contextos disponibles.

Seleccionar una familia concentra el Catálogo en ese rubro. La aplicación no crea una ficha de familia ficticia mientras no exista una entidad propia.

## Catálogo

La búsqueda incluye nombre, descripción, SKU, marca, línea, rubro, subrubro, familia comercial, grupo y presentación. Los filtros combinables cubren rubro, marca, línea, estado maestro y clasificación de inventario; disponibilidad y orden son selecciones únicas.

Los órdenes disponibles son rotación, venta de 90 días, compradores, stock, precio, última venta, nombre y orden original. Las filas exponen precio, stock, rotación, compradores, última venta y venta atribuida sin exigir abrir la ficha.

## Análisis técnico

La vista principal no muestra una matriz vectorial. `Ver análisis técnico`, cerrado por defecto, conserva:

- 33 dimensiones;
- porcentajes individuales positivos;
- evidencia completa por dimensión;
- cobertura de fuentes y confianza;
- comparación exacta de perfil y taxonomía;
- coincidencias y diferencias.

El selector técnico se limita a las 24 alternativas más cercanas para evitar una lista indiscriminada de todo el catálogo. El explorador de las 33 dimensiones permanece en Herramientas técnicas.

Las alternativas de la vista habitual usan etiquetas comprensibles y explican coincidencias. Su similitud no se presenta como probabilidad de venta.

## Limitaciones visibles

- GESI no informa una marca inequívoca de discontinuación.
- Costo, margen, proveedor y reposición no tienen una fuente validada para esta ficha.
- Las facturas sin detalle no se atribuyen a productos ni compradores.
- El historial de evolución visible está limitado a los 90 días capturados.
- No se descuentan facturas localmente del stock: la existencia vigente se vuelve a leer de GESI en cada actualización aprobada.

## Validación

- El resumen, la presentación y las bandas comerciales poseen pruebas determinísticas.
- La persistencia prueba la migración de `Pendiente` a `En revisión` sin perder la nota y conserva el guardado de `Revisado`.
- Suite completa: 127 pruebas aprobadas, 7 conciliaciones históricas omitidas de manera explícita y 0 fallas.
- Build de producción: correcto.
- Auditoría de datos: 0 problemas.
- Integridad de operaciones: correcta sobre 15 tablas.
- Auditoría de plataforma: 22 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de cobertura/calidad de GESI.
- Auditoría de vectores: aprobada con revisión pendiente de los casos ya documentados; no se modificó el algoritmo ni se ocultaron contradicciones.
- Revisión visual de escritorio: los tres estados de revisión, el extracto de una nota extensa, la nota completa en la ficha y el modal buscable con todos los compradores fueron verificados sin desborde horizontal. También se conservaron las verificaciones de catálogo, filtros, orden, navegación y análisis técnico.
- El tutorial no se modifica en esta entrega, según el alcance acordado.
