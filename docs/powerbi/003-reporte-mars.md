# 003 · Reporte Mars

## Propósito

Seguimiento comercial del proveedor Mars dentro de Salice: volumen de Pet Nutrition, cobertura de clientes, evolución por período comercial, acumulado YTD, quarters y mix de marcas. El reporte permite alternar entre cuentas únicas y sucursales de entrega.

Archivo de referencia: `Reporte Mars.pbix`, revisado el 20/07/2026. El PBIX se usa para entender reglas, medidas, páginas y diseño; la ventana operativa consulta exclusivamente la base analítica construida desde la API GESI.

## Páginas y controles observados

Las páginas visibles son `Clientes por Sucursal` y `Clientes por cuenta`. Ambas comparten el volumen y cambian solamente la unidad de cobertura:

- cuenta: `DISTINCTCOUNT(ClienteID)`;
- sucursal: `DISTINCTCOUNT(ClienteID + SucursalClienteID)`.

Los controles observados son Año Mars, Período Mars, Sucursal, Tipo de cliente, canal agrupado, marca y subrubro agrupado. Las marcas de interés son Iams, Optimum, Pedigree, Pedigree High Pro y Whiskas.

## Universo reconstruido en GESI

- empresa 3;
- sucursal emisora 3;
- emisor `Salice Distribuciones S.A.`;
- grupo de artículo `Pet Nutrition`;
- se excluye `Via Salice MDP S.A.`;
- volumen neto = kilos de facturas menos kilos de notas de crédito.

En el PBIX aparece además un filtro visual que excluye `SucursalNombre = Mar del Plata` en algunas tarjetas. No se trasladó como exclusión global porque quitaría sucursales reales de entrega y no cambia las cifras testigo de 2026. La aplicación conserva el modelo explícito cuenta/sucursal y muestra ambos conteos.

## Calendario Mars

El año Mars comienza el domingo más cercano al 31 de diciembre del año calendario anterior. Tiene 13 períodos: P01 a P12 duran 28 días y P13 absorbe la semana adicional cuando corresponde. Los quarters son Q1=P01–P03, Q2=P04–P06, Q3=P07–P09 y Q4=P10–P13.

| Período 2026 | Desde | Hasta |
|---|---|---|
| P01 | 28/12/2025 | 24/01/2026 |
| P06 | 17/05/2026 | 13/06/2026 |
| P07 | 14/06/2026 | 11/07/2026 |
| P08 | 12/07/2026 | 08/08/2026 |
| P13 | 29/11/2026 | 02/01/2027 |

Cuando un período está en curso, el volumen actual llega hasta la última fecha disponible de GESI. Las comparaciones YTD, de evolución y por marca usan la misma cantidad de días del año anterior. La tarjeta del mismo período del año anterior conserva la base completa y lo declara en pantalla.

## Agrupaciones funcionales

- Canal `Especializado`: Consumidor Final, COSTA-RUTA2, Especial, Criadores, Distribuidor, Freelance, Empleados, Especializado, Especializado Z2/Z3, Partido de la Costa, Refugios y Reventa/Reventa2.
- Canal `Masivo`: On Line, Tienda, Gastronómico, Masivo, Premium, Saludable y Small Retail.
- Subrubros: C&T; Large Bags/Small Bags → DRY; Latas → MUSE; Sobrecitos → SiSe.
- Sucursal: 7 → Bahía Blanca; 3/6 → Mar del Plata; cualquier otra → Otros.

El maestro `TiposDeCliente/GetList` de GESI devolvió vacío durante la captura. Los nombres se muestran mediante un catálogo de referencia estable aplicado a los IDs recibidos; clientes, IDs y movimientos continúan proviniendo de GESI. La salvedad queda visible al pie del reporte.

## Cifras testigo y conciliación

| Corte | GESI v0.2.4 | PBIX de referencia | Diferencia |
|---|---:|---:|---:|
| P07 2026 kilos | 37.375,825 | 37.400,805 | -24,980 (-0,07%) |
| P07 cuentas | 491 | 491 | 0 |
| P07 sucursales | 520 | 520 | 0 |
| P06 2026 kilos | 39.863,4245 | 39.885,7045 | -22,280 (-0,06%) |

La diferencia de volumen se conserva: la pantalla representa el estado actual de GESI, sin forzar resultados antiguos de la vista SQL del PBIX. Al 20/07/2026, P08 está en curso y GESI ya contiene movimientos posteriores a la última carga embebida inspeccionada en el archivo.

La base operativa contiene 256.683 renglones desde el 30/12/2024. Tres comprobantes no entregaron detalle en GESI y quedan identificados para futuros refrescos; uno pertenece al breve backfill necesario para reconstruir P01 2025.

## Reemplazo web

La v0.2.4 agrega `Reportes → Reporte Mars` con selector de cuenta/sucursal, filtros globales, seis KPI, gráficos interactivos de volumen y clientes, quarters, mix sortable por marca, tabla auditable de períodos y trazabilidad visible.

Endpoints: `GET /api/reports/mars/meta` y `GET /api/reports/mars`.

## Experiencia común v0.8.6

Mars comparte con NutriPet y Baires la estructura visual de filtros, período, indicadores, carga y fuente. Conserva su calendario comercial, la alternativa cuenta/sucursal, dimensiones, universo y métricas propias.
