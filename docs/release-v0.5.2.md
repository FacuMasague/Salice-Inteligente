# Bandeja de decisión de inventario · v0.5.2

## Objetivo

Convertir la base confiable de v0.5.1 en una superficie diaria de revisión para la oficina. La bandeja ordena señales y contexto; no automatiza compras ni modifica GESI.

## Universo y fuente

La bandeja consume del catálogo operativo únicamente los productos con stock U1 positivo o unidades vendidas en los últimos 90 días. Stock corresponde a U1 disponible de empresa 3, sucursal 3 y depósito 2. Demanda, rotación y última venta provienen del detalle de facturas capturado desde GESI. Las definiciones de estos campos siguen siendo las de v0.5.1 y no se recalculan en la interfaz.

Los productos sin stock y sin rotación reciente no desaparecen del sistema: permanecen en el Catálogo y pueden localizarse con su buscador. Esta separación evita que el indicador operativo quede ocupado por artículos sin una señal actual que revisar.

Cada producto recibe exactamente una clasificación, con esta precedencia:

1. `Fuera de surtido o inactivo`: maestro inactivo en GESI o excepción humana `Discontinuado`.
2. `Sin datos suficientes`: maestro desconocido, existencia ausente o negativa, unidad primaria ausente u otra calidad insuficiente.
3. `Sin stock con demanda reciente`: stock U1 observado igual a cero y unidades positivas en 90 días.
4. `Stock sin movimiento`: stock positivo, cero unidades en 90 días y alguna última venta fechada en el historial.
5. `Producto nuevo o sin historia suficiente`: sin historia suficiente para distinguir alta reciente, falta de demanda o falta de cobertura calculable.
6. Estados de cobertura para stock y rotación positivos.

La etiqueta “nuevo” no afirma una fecha de alta: GESI no la entrega en la fuente actual. La explicación aclara cuando sólo puede concluirse que falta historia.

## Umbrales iniciales

La política compartida `1.0` usa, sin redondeo previo:

- cobertura crítica: menos de 0,5 mes;
- cobertura baja: desde 0,5 hasta menos de 1 mes;
- cobertura adecuada: desde 1 hasta menos de 3 meses;
- cobertura alta: 3 meses o más;
- demanda reciente: ventana de 90 días ya disponible en el snapshot.

La estructura acepta reemplazos parciales por familia/rubro del catálogo. En v0.5.2 `familyOverrides` está vacío: todas las familias usan la regla general hasta validar diferencias con Salice.

## Filtros, indicadores y orden

La bandeja combina estado, marca, familia/rubro, grupo, actividad del maestro, situación de rotación y estado de revisión. La búsqueda incluye producto, SKU y las clasificaciones comerciales disponibles. Los encabezados de producto, estado, stock, rotación, cobertura y revisión alternan ascendente, descendente y orden prioritario.

El orden predeterminado deja primero los productos `No revisado`, luego `En revisión` y finalmente `Revisado`. Dentro de cada grupo prioriza, en este orden: sin stock con demanda, cobertura crítica, cobertura baja, problemas de datos, stock sin movimiento, historia insuficiente, cobertura alta, cobertura adecuada y fuera de surtido/inactivo. Después usa la magnitud relevante: mayor demanda para quiebres, menor cobertura para estados bajos, mayor cobertura para sobrestock y mayor existencia para stock inmóvil. El usuario puede sustituir ese orden desde cualquier encabezado y recuperarlo en el tercer ciclo.

Los indicadores muestran:

- cantidad de productos y alertas en el filtro;
- marcas afectadas y ranking de alertas por marca;
- familias afectadas y ranking de alertas por familia;
- productos revisados localmente.

Producto y marca son entidades navegables. Una familia actúa como filtro porque todavía no posee una ficha independiente.

## Revisión humana y excepciones

`operations.sqlite` incorpora `inventory_alert_reviews`, separada del snapshot. La ausencia de un registro significa `No revisado`; una intervención conserva estado `En revisión` o `Revisado`, nota, excepción, actor y fecha de actualización. Los registros antiguos `Pendiente` se migran de manera conservadora a `En revisión`, sin perder sus demás campos.

La tabla muestra un extracto acotado de la nota para no alterar el ancho de la lista. El texto completo permanece disponible en la ficha del producto y al abrir la revisión.

Las excepciones disponibles son:

- `Estacional`: aporta contexto sin cambiar la clasificación matemática;
- `Discontinuado`: mueve el artículo a fuera de surtido por decisión humana, sin reescribir el estado maestro de GESI;
- `Stock reservado`: aporta contexto, pero no descuenta unidades ni cambia cobertura porque no se pide una cantidad reservada.

Una actualización de datos no elimina estas revisiones. Si un código deja de formar parte del catálogo operativo, su registro local se conserva para auditoría y puede volver a aplicarse si reaparece.

## Vectores

El perfil de 33 dimensiones sigue disponible y auditable, pero queda cerrado por defecto detrás de `Ver perfil vectorial técnico`. La bandeja operativa no usa los vectores para alterar una clasificación de inventario.

## Navegación de escritorio

Bandeja de inventario, Catálogo y Herramientas técnicas comparten el mismo selector superior, que permanece en la misma posición al cambiar de sección. Se eliminan los retornos aislados dentro del contenido.

El menú lateral de la aplicación inicia abierto y puede plegarse o desplegarse desde la barra superior. El estado plegado libera el ancho completo para tablas y listas; no cambia la sección seleccionada ni sus filtros.

## Límites deliberados

- No se crean órdenes de compra.
- No se proponen cantidades de reposición.
- No se inventan costos, proveedores, plazos de entrega, stock comprometido ni demanda futura.
- No se descuenta stock reservado sin cantidad verificable.
- No se agregan tareas nocturnas, automatización de captura, funciones móviles ni multitenencia.
- La clasificación es una ayuda de revisión; una persona conserva la decisión operativa.

## Validación

La clasificación posee pruebas determinísticas de límites, precedencias, calidad, historia insuficiente y política por familia. La persistencia prueba alta y actualización de estado, nota y excepción sin tocar señales GESI.

- Suite completa: 123 pruebas aprobadas, 7 conciliaciones históricas omitidas por no estar disponible el paquete exacto del 20/07/2026 y ninguna falla.
- Build de producción: aprobado.
- Auditoría de datos: 0 problemas.
- Integridad de `operations.sqlite`: correcta, con 15 tablas.
- Auditoría de plataforma: 0 fallas requeridas y 5 advertencias conocidas de GESI/datos.
- Revisión visual de escritorio: bandeja, universo stock/rotación, prioridad inicial, selector común de Productos, menú lateral plegable, navegación a producto y vectores cerrados por defecto verificados; consola sin errores.
