# 006 · Cuentas no compradoras

## Propósito

El reporte identifica cuentas y marcas que tuvieron actividad comercial reciente pero dejaron de comprar en los últimos 30 días. Su uso principal es orientar acciones de recuperación por vendedor y revisar la recurrencia comercial sin depender de Power BI.

Archivo de referencia analizado: `Cuentas no compradoras.pbix`. El archivo se utiliza únicamente para entender reglas, filtros, disposición y cifras testigo. La pantalla operativa consulta exclusivamente la base analítica construida desde la API de GESI.

## Páginas del Power BI

### Cuentas “No Compradoras”

- Cuentas no compradoras en los últimos 30 días.
- Porcentaje sobre el universo comprador de los últimos 90 días.
- Cantidad de clientes del universo de 90 días.
- Distribución de cuentas no compradoras por vendedor.
- Detalle de todo el universo activo de 180 días: ID, cliente unificado, días desde la última compra y promedios mensuales de kilos y venta de los tres meses anteriores completos.

### Marcas “No Compradas”

- Marcas no compradas en los últimos 30 días.
- Porcentaje sobre el universo de marcas compradas en los últimos 90 días.
- Cantidad de marcas del universo de 90 días.
- Distribución de marcas no compradas por vendedor.
- Detalle de todo el universo de marcas de 180 días con la misma recencia y promedios.

Las tablas del Power BI muestran el universo completo; no quedan restringidas automáticamente a los casos sin compra. La web conserva esa lectura y agrega controles explícitos para alternar entre `Todos`, `Sin compra 30d` y `Compraron 30d`.

## Definiciones reconstruidas

La fecha de corte es la última `FechaComprobante` disponible en los movimientos elegibles.

- **Universo 180d:** entidad con suma de venta neta positiva entre la fecha de corte menos 180 días y la fecha de corte.
- **Sin compra 30d:** entidad del universo de 180 días cuya suma de venta neta no es positiva en los últimos 30 días.
- **Universo 90d:** entidad con suma de venta neta positiva en los últimos 90 días.
- **Tasa sin compra:** cantidad sin compra en 30 días dividida por el universo comprador de 90 días.
- **Días desde última compra:** diferencia entre la fecha de corte y la última fecha diaria con venta neta positiva.
- **Promedio de kilos / ventas de tres meses:** suma de los tres meses calendario completos anteriores al mes de corte, dividida por tres. Un mes sin actividad participa como cero.

Facturas y notas de crédito se agregan como venta neta. Por eso una entidad puede tener movimientos y, aun así, no contar como compradora si el neto de la ventana no es positivo.

## Universo y filtros

Filtros generales observados y reproducidos:

- empresa 3;
- sucursal 3;
- emisor `Salice Distribuciones S.A.`;
- estado de cliente `Activo`;
- cliente distinto de `Consumidor Final`, vacío y anulado;
- grupo de artículos distinto de `Drovet` y `Kualcos`;
- rubro distinto de `POP` y `Promociones`;
- vendedor distinto de `Administración`, `Carolina` y vacío.

La página de marcas excluye además `Cancat`, `Lokal`, `Mi QR`, `Kualcos`, vacío, `Pampa Criadores` y `De La Huerta`.

La web permite filtrar por vendedor, grupo de artículos, rubro y marca. Todos esos filtros recalculan tarjetas, barras y tablas sobre los movimientos GESI.

## Conciliación al 20/07/2026

| Indicador | Power BI | GESI web | Diferencia |
|---|---:|---:|---:|
| Cuentas sin compra 30d | 213 | 212 | -1 |
| Universo de cuentas 90d | 764 | 771 | +7 |
| Tasa de cuentas sin compra | 28% | 27,5% | redondeo y universo |
| Marcas sin compra 30d | 15 | 15 | 0 |
| Universo de marcas 90d | 67 | 67 | 0 |
| Tasa de marcas sin compra | 22% | 22,4% | sólo redondeo |

Distribución de cuentas sin compra por vendedor en GESI: Ignacio Carea 60, Edgardo Larrea 50, Julieta Errecart 37, Andres Dominguez 26, Ana Ottaviano 21, Gonzalo Russian 17 y Reventas 1. En el PBIX se observaron 61, 51, 36, 26, 21, 17 y 1 respectivamente.

La distribución de marcas sin compra coincide con las cifras visibles del PBIX: Ana Ottaviano 13, Julieta Errecart 9, Andres Dominguez 8, Gonzalo Russian 7, Ignacio Carea 5 y Edgardo Larrea 2.

## Calidad y límites conocidos

- La base analítica GESI contiene 256.683 movimientos totales; después de aplicar el universo del reporte quedan 204.923 movimientos elegibles, con cobertura hasta el 20/07/2026. El modelo incrustado en el PBIX contiene 257.334 filas antes de sus filtros visibles. La pequeña diferencia de cuentas es compatible con diferencias de actualización o transformación de la vista SQL.
- `AcuerdosComerciales` es una columna física de la vista SQL del Power BI, con valores como Old Prince, Raza, Pampa, MaxPet y Fawna. La API actual de GESI no expone ese maestro ni una relación verificable con clientes. La pantalla informa la ausencia y no crea datos derivados del PBIX.
- `Cliente unificado` también proviene de la vista SQL. La API entrega el nombre del cliente, pero no el maestro exacto de unificación. La web usa `client_name` como nombre operativo y conserva el ID GESI para distinguir cuentas.
- La captura informa tres documentos no disponibles. Se mantienen declarados como limitación de fuente.

## Reemplazo web v0.2.7

`Reportes → Cuentas no compradoras` incorpora:

- vistas alternables de cuentas y marcas;
- cuatro KPI recalculados;
- barras interactivas por vendedor con universo y tasa;
- filtros globales y búsqueda del detalle;
- ordenamiento de tres estados en todas las columnas;
- segmentación explícita por situación de compra;
- explicación visible de ventanas y reglas;
- trazabilidad de fuente y límites sin dependencia operativa del PBIX.
