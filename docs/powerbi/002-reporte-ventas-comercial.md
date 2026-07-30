# PBIX 002 · Reporte Ventas - Comercial

## Archivos recibidos

- `Reporte Ventas - Comercial.pbix`: 20,6 MB, con `DataModel` embebido.
- `Reporte Ventas - Comercial (1).pbix`: 80,5 KB, conexión en vivo al modelo publicado en Power BI Service.
- Ambos contienen exactamente la misma definición de página y visuales. El contenido de `Report/Layout` tiene el mismo hash SHA-256.

Para futuras entregas sirve mucho más el archivo grande con datos/modelo importado. Permite inspeccionar medidas DAX, columnas calculadas, relaciones, transformaciones y cifras testigo sin depender de una sesión o permiso de Power BI. El archivo liviano sólo aporta la definición visual y la dirección del modelo remoto.

## Propósito

El reporte resume el desempeño comercial de Mar del Plata. Responde principalmente:

- cuánto se vendió en el mes seleccionado;
- cómo se compara con igual cantidad de días del mes anterior;
- cuánto aporta cada negocio —Balanceado, Autoservicio, Drovet, Sanitarios y Otros—;
- cómo evoluciona la venta neta respecto del año anterior;
- qué marcas y productos explican kilos, facturación y precio promedio por kilo.

El PBIX contiene una única página, `Mar del Plata`, con 22 contenedores visuales.

## Controles y visuales

Filtros principales:

- mes;
- vendedor;
- rubro;
- marca;
- grupo de artículo.

Indicadores:

- Venta Neta;
- venta neta del mes anterior hasta el mismo día;
- diferencia absoluta contra el mes anterior;
- variación porcentual;
- Ventas T. Balanceado;
- Ventas T. Drovet;
- Ventas T. Accesorios y Sanitarios;
- Ventas T. Autoservicios.

Visuales analíticos:

- evolución mensual de venta neta contra año anterior, disponible tanto dentro de un mes como en la vista anual;
- composición de venta neta por negocio;
- matriz de marca y producto con kilos, precio promedio por kilo, participación en kilos, venta neta, participación en ventas y promedio diario.

## Definiciones reconstruidas

- `Total Ventas`: suma del importe neto de los movimientos.
- `Mes anterior al día`: desde el primer día del mes anterior hasta el mismo número de día del período seleccionado; el día se limita al último día real del mes.
- `Diferencia`: venta neta actual menos venta neta del mes anterior equivalente.
- `Variación`: diferencia dividida por la venta neta del mes anterior equivalente.
- `Precio promedio por kilo`: promedio de los cocientes importe neto/kilos de cada movimiento con kilos distintos de cero, siguiendo la definición del modelo de referencia.
- `Promedio diario`: venta neta del período dividida por los días cubiertos.

La implementación permite alternar entre frecuencia mensual y anual. En mensual compara contra el mes anterior hasta el mismo día; en anual compara desde el 1 de enero hasta la fecha cubierta contra el mismo intervalo del año previo. Todos los filtros, indicadores, negocios, composición y desgloses usan la misma ventana seleccionada.

La matriz de marca/producto conserva el filtro propio del PBIX: Alimento Húmedo, Alimentos Balanceados y Snacks.

## Clasificación de negocios

`Small Retail` se clasifica primero como Autoservicio. Para los demás canales:

- Balanceado: Baires Masivo, Baires SPT, Devoluciones, Handler, Lokal, Nutri Pet, Patagonia Pet, Pet Nutrition y SP - Eukanuba + Iams.
- Drovet: Drovet y Kualcos.
- Sanitarios: Andacollo, BedyWood, CanCat, Chapas - QR, Sanicat, Sol Minerales y Zootec.
- Cualquier otro caso se informa como Otros.

Las tarjetas de Balanceado, Drovet y Sanitarios excluyen `Small Retail`, mientras Autoservicios toma directamente ese canal.

## Universo y fuente operativa

El panel publicado se verificó directamente el 20/07/2026 y aplica estas reglas de página:

- `EmpresaID = 3`;
- `SucEmpresa = 3`;
- `RazonSocial` admite únicamente `Salice Distribuciones S.A.`;
- excluye `Via Salice MDP S.A.`, `Consumidor Final` y `GBA M6 S.A.`.

Desde v1.2.2 la implementación web restringe el universo a empresa 3 / sucursal 3 y emisor Salice. Las opciones históricas de sucursal 6 y otras combinaciones dejan de formar parte del contrato aunque no hayan aportado filas a la última captura.

La pantalla utiliza `data/spt-gesi.sqlite`, construida directamente desde facturas, notas de crédito, clientes, productos, vendedores, canales y clasificaciones de la API de GESI. El PBIX no se abre durante la operación; sólo queda como referencia funcional y de conciliación.

## Cobertura y control del corte recibido

El modelo embebido contiene 791.397 movimientos y llega al 17/07/2026. La captura operativa GESI usada por v0.2.2 también llega al 17/07/2026 y, después de las exclusiones comerciales, conserva 251.118 movimientos desde el 02/01/2025.

Control preliminar para julio de 2026, empresa 3 / sucursal 3 y corte al día 17:

| Fuente | Venta neta | Kilos | Clientes |
|---|---:|---:|---:|
| PBIX embebido, universo reconstruido | $306.662.701,71 | 121.585,6172 | 557 |
| GESI operativo v0.2.2 | $311.625.304,14 | 121.655,6172 | 556 |

La diferencia preliminar es de $4.962.602,43 (+1,62%) y 70 kg (+0,06%). No se intentó adivinar los filtros o ajustes propios de la vista SQL: la revisión fina queda pendiente de las reglas que entregue Administración. Mientras tanto, la web muestra de forma coherente el universo GESI vigente y deja la fuente explícita.

## Verificación en línea · v0.2.3

Al inspeccionarse el reporte publicado, Power BI mostraba $323.768.878,76 para julio. La captura directa de GESI realizada después, a las 10:05 de Argentina, devolvió $329.538.909,08 con el universo ya corregido. La diferencia de $5.770.030,32 es compatible con movimientos del 20/07 incorporados después del refresco de Power BI; el sistema conserva el valor más reciente de GESI y deja visibles la hora de la foto y el corte.

## Implementación v0.2.3

La navegación `Reportes` incorpora `Ventas · Comercial`. Todos los filtros recalculan indicadores, segmentos, evolución, composición y matriz. Los gráficos muestran valores exactos al pasar el puntero; la matriz ordena ascendente, descendente y vuelve al orden original, y cada marca puede desplegar sus productos.

El servidor expone:

- `GET /api/reports/commercial-sales/meta`
- `GET /api/reports/commercial-sales`

Las pruebas verifican fuente GESI, empresa 3, sucursal 3, emisor Salice, exclusiones internas, cobertura, corte equivalente, conciliación entre total y composición, clasificación de negocios y recálculo por vendedor.

## Ampliación administrativa v0.4.0

`Administración → Explorador de ventas` reutiliza el mismo contrato ejecutable de esta ficha y agrega el uso cotidiano que no correspondía a la página analítica original:

- filtro global por fecha, vendedor, cliente, producto, marca, rubro, canal y zona;
- KPI reconciliados de venta neta, kilos, unidades y clientes, más comprobantes, ticket promedio y venta por kilo definidos en el catálogo central;
- recorrido indicador → período → cliente o producto → comprobante → renglones exactos;
- navegación a perfiles de cliente y producto;
- vistas frecuentes persistidas;
- exportación CSV/XLSX al grano de renglón de comprobante-producto, con corte, universo y filtros.

El servidor expone `GET /api/admin/sales/meta`, `GET /api/admin/sales`, `GET /api/admin/sales/document` y `GET /api/admin/sales/export`. Las pruebas reconcilian el resumen contra `server/report-metrics.ts` bajo exactamente el mismo WHERE y verifican que los renglones sumen al comprobante abierto.
