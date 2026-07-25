# PBIX 001 · Reporte SPT Vol vs mes anterior

## Identificación

- Archivo analizado: `Reporte SPT Vol vs mes anterior.pbix`.
- Tamaño: 8,8 MB.
- El modelo contiene movimientos desde el 02/01/2024 hasta el 17/07/2026 y fue refrescado el 17/07/2026 según sus marcas internas.
- Contiene 4 páginas visibles, 60 objetos visuales, 38 medidas DAX y una tabla principal de 526.835 movimientos con 47 campos.

## Propósito

El reporte monitorea el volumen vendido en kilos. Su pregunta central es cuánto se vendió en el mes seleccionado y cómo se compara con:

- el mismo avance del mes anterior;
- el mismo avance del mismo mes del año anterior;
- el acumulado anual del año anterior;
- el comportamiento de los vendedores;
- los últimos meses y trimestres.

También cuenta clientes distintos y, en una página secundaria, expone importe neto y promedio de kilos de los últimos tres meses.

El PBIX no desarrolla la sigla `SPT`. Por el uso habitual en la industria de alimento para mascotas y por los canales seleccionados en el propio reporte, la interpretación más probable es **Specialist Pet Trade** o **Specialized Pet Trade**: el canal especializado de mascotas, principalmente pet shops y comercios afines. Debe confirmarse con Salice porque también aparece como parte del nombre interno `Baires SPT`. Como referencia externa, [Royal Canin utiliza SPT con el significado Specialist Pet Trade](https://www.royalcanin.com/ie/about-us/retailer-sensory).

## Páginas visibles

| Página | Contenido |
|---|---|
| CARATULA | Portada con imagen, fecha de actualización y navegador de páginas. |
| SPT Vol vs mes anterior | Página principal: tabla diaria, kilos del mes, comparaciones contra mes/año anterior, clientes, evolución de 13 meses y 13 segmentadores. |
| Vendedores | Análisis comercial por vendedor: kilos, clientes, importe neto, promedio de los últimos tres meses, evolución mensual y tabla diaria. |
| Trimestre | Gráfico de kilos por trimestre y comparación contra el mismo trimestre del año anterior. |

## Fuente y transformación

El PBIX y Salice Inteligente se alimentan de GESI, pero por interfaces diferentes. El PBIX no consume la API utilizada actualmente por la web: lee una vista SQL generada desde GESI en el entorno `Verscom2k`, combina el conjunto vigente con una consulta histórica denominada `Movimientos 2024` y luego aplica transformaciones en Power Query.

Transformaciones relevantes:

1. Convierte fechas, kilos, unidades, importes y estados a tipos explícitos.
2. Reemplaza el vendedor de sucursal `Male` por `Delfina`.
3. Reescribe todas las fechas 02/06/2025 y 03/06/2025 como 31/05/2025.
4. Anexa el histórico 2024, cuya estructura no tiene la misma cobertura que 2025–2026.

La tabla `Movimientos` incluye producto, cliente, marca, línea, rubro, subrubro, familia, unidades, kilos, importe neto, fecha, zona, canal, localidad, vendedor, empresa y comprobante.

## Medidas principales

| Métrica | Definición observada |
|---|---|
| Total de Kilos | Suma de `Movimientos[Kilos]`. |
| Kilos MTD | Total acumulado dentro del mes seleccionado. |
| Kilos mes anterior | Mismo contexto desplazado un mes. |
| Kilos año anterior | Mismo período desplazado un año. |
| Clientes | Cantidad distinta de `ClienteID`. |
| YTD | Kilos acumulados desde el inicio del año. |
| Vs mes anterior | Cociente `kilos actuales / kilos anteriores`; no es la diferencia porcentual. |
| Vs año anterior | Cociente `kilos actuales / kilos del año anterior`. |
| Promedio últimos tres meses | Promedio simple de los tres meses completos anteriores. |
| Importe neto | Suma de `ElImporteNeto`. |

La medida llamada `Promedio diario` divide el MTD por el número de día. Funciona por fila diaria, pero su total mensual puede ser engañoso porque el denominador pasa a ser la suma de los números de día.

## Filtros guardados en la página principal

- Mes guardado: julio de 2026.
- Empresas admitidas: 3 y 6.
- Vendedores: Ana Ottaviano, Andres Dominguez, Edgardo Larrea, Gonzalo Russian, Ignacio Carea, Julieta Errecart y Reventas.
- Canales: COSTA-RUTA2, Especializado, Especializado Z2, Small Retail y Partido de la Costa.
- Grupos: ANDACOLLO, Baires Masivo, Baires SPT, BEDYWOOD, CanCat, Lokal, Nutri Pet, Patagonia Pet, Pet Nutrition, Sanicat y Sol Minerales. Power BI resuelve ANDACOLLO/Andacollo y BEDYWOOD/BedyWood sin distinguir mayúsculas.
- Se excluyen los rubros POP y Promociones.

El usuario puede segmentar por mes, vendedor, marca, grupo, canal, producto, cliente, línea, rubro, subrubro, tipo de cliente/domicilio, agrupación y localidad. Hay botones para borrar las segmentaciones.

## Cifras testigo del PBIX

Estas cifras se recalcularon directamente sobre el modelo embebido, con los filtros guardados de la página `SPT Vol vs mes anterior` y corte al 17/07/2026:

| Indicador | Valor |
|---|---:|
| Kilos 01–17/07/2026 | 116.416,18 kg |
| Clientes distintos | 519 |
| Kilos 01–17/06/2026 | 130.571,83 kg |
| Kilos 01–17/07/2025 | 132.582,00 kg |
| Cociente contra mes anterior | 89,16% |
| Cociente contra año anterior | 87,81% |
| Cociente YTD contra YTD anterior | 106,93% |
| Importe neto del período | $287.633.871,96 |

En ese corte, aunque el filtro admite empresas 3 y 6, las filas resultantes pertenecen únicamente a empresa 3.

La página `Vendedores`, que usa un universo algo más amplio, devuelve para el mismo corte 119.908,80 kg, 525 clientes y $302.970.326,45 de importe neto. No debe compararse directamente contra la página principal porque los grupos y canales admitidos son diferentes.

## Hallazgos de calidad y mantenimiento

| Severidad | Hallazgo | Riesgo |
|---|---|---|
| Alta | La fuente es una vista SQL de GESI, mientras la web usa la API de GESI; además el PBIX aplica correcciones manuales de fechas. | Compartir sistema de origen no garantiza coincidencia automática si las interfaces, el grano o las reglas de transformación difieren. |
| Alta | La página `Trimestre` conserva vendedores antiguos. Sólo 3 de sus 9 nombres seleccionados aparecen entre los vendedores actuales de 2026; además filtra `Male` después de haberlo reemplazado por `Delfina`. | El gráfico trimestral excluye parte importante del equipo actual. |
| Alta | El histórico 2024 tiene `Vendedor` vacío en el 100% de sus 269.694 filas y localidad vacía en 65,95%. | Los filtros por vendedor o localidad no son comparables entre 2024 y los años siguientes. |
| Media | Hay 1.145 filas completamente idénticas (0,217%), equivalentes a 10.714,84 kg y $71.366.240,87 si se contaran como excedentes. | Sin un identificador de renglón no puede determinarse si son duplicados o líneas legítimas repetidas. |
| Media | `Vs mes anterior` y `Vs año anterior` son cocientes, no variaciones. | Un valor de 91% puede interpretarse erróneamente como +91% en vez de -9%. |
| Media | Los filtros dependen de listas fijas de vendedores, grupos y canales. | Nuevas altas o cambios de nombre pueden quedar fuera sin aviso. |
| Media | Existen variantes por mayúsculas de Andacollo y BedyWood; Power BI las compara sin distinguir mayúsculas, pero SQLite no lo hace por defecto. | Una migración literal puede omitir 1.257 kg del corte actual. La web normaliza explícitamente las variantes reales. |
| Baja | Una medida no tiene expresión y otra referencia una tabla de ejemplo inexistente (`TuTabla`). | Deuda técnica; no afecta los visuales actuales mientras continúen sin uso. |
| Baja | Siete bookmarks de marcas apuntan a una página eliminada y ningún visual los utiliza. | Configuración muerta que dificulta el mantenimiento. |
| Baja | El diseño móvil contiene páginas huérfanas y no incluye la página Trimestre. | La versión móvil no refleja completamente el informe visible. |

## Implicancias para Salice Inteligente

Este reporte no debe copiarse literalmente. El reemplazo web debería conservar las decisiones útiles y corregir las dependencias frágiles:

1. Crear una métrica canónica de kilos con fuente y unidad explícitas.
2. Usar `cantidadU2` del detalle de GESI como kilos canónicos; la conciliación confirmó que coincide con `Kilos` del modelo, sin inferir el peso desde la descripción.
3. Definir por separado `cumplimiento contra período` y `variación porcentual`.
4. Usar vendedores, canales y grupos dinámicos, sin listas rígidas dentro del reporte.
5. Decidir con Administración si las fechas de junio de 2025 deben corregirse o si ese ajuste fue una solución temporal del PBIX.
6. Mantener conciliado el valor testigo de 116.416,18 kg, aceptando diferencias trazables por documentos posteriores al refresco del PBIX, antes de retirar esta página de Power BI.
7. Mantener una dimensión calendario explícita y evitar depender de tablas de fechas automáticas.

## Verificación de filtros · v0.2.3

El 20/07/2026 se verificó directamente el panel de filtros de la página publicada. Continúan vigentes las empresas 3/6, los siete vendedores, los cinco canales, los once grupos y la exclusión de POP/Promociones documentados arriba. En el corte observado, las filas resultantes siguen perteneciendo únicamente a empresa 3.

La instancia publicada mostraba 119.986,591 kg al momento de la inspección. La captura directa de la API realizada a las 10:05 de Argentina devolvió 123.949,142 kg con exactamente el mismo universo. La diferencia de 3.962,551 kg corresponde a movimientos del 20/07 que ya estaban en GESI después de la actualización de Power BI; no se recorta la fuente actual para igualar una foto anterior del mismo día.

## Estado de migración

La implementación operativa construye `data/spt-gesi.sqlite` directamente desde facturas, notas de crédito, clientes, productos, vendedores, canales y clasificaciones de la API de GESI. El filtro del reporte admite empresas 3 y 6 tal como Power BI; la consulta de API del 20/07 confirmó que el contexto adicional no devolvió comprobantes y que el resultado vigente pertenece a empresa 3 / sucursal 3. El backfill mensual cubre desde el 01/01/2025.

El PBIX se conserva en `data/reference/spt-pbix.sqlite` únicamente para verificar resultados. No forma parte de la ruta de ejecución, no actualiza la web y puede eliminarse sin impedir que el reporte funcione. La conciliación identificó que las notas de crédito deben restarse, que el vendedor de la página principal es el asignado al cliente y que `NombreVendSucursal` proviene de la definición del cliente para la sucursal.

Al comparar el corte 01–17/07/2026, la API actual devolvió 116.461,178 kg y 519 clientes frente a 116.416,178 kg y 519 clientes del PBIX. La diferencia de 45 kg y $129.608,55 corresponde a una factura ingresada el 17/07/2026 a las 18:43:59, después de la foto de referencia. Esto confirma que igualar a la fuerza el número viejo del PBIX produciría un dato operativo desactualizado.

La web agrega etiquetas más explícitas para distinguir cociente de cumplimiento y variación porcentual, filtros globales, evolución diaria acumulada, historia de 13 meses y pestañas de vendedores y trimestre. `pnpm run reconcile:spt` genera un control repetible entre ambas fuentes sin convertir Power BI en una dependencia.

## Simplificación de filtros v0.8.6

La pantalla prioriza mes, vendedor, canal y grupo de artículos. Los demás criterios continúan disponibles en `Más filtros`, separados entre criterios comerciales comunes y específicos del contrato SPT. Producto y cliente aparecen una sola vez; la simplificación no cambia parámetros, universo ni cálculo del endpoint.
