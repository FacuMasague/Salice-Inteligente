# 008 · Saldos Pendientes Salice

## Alcance del relevamiento

El archivo `.pbix` no estuvo disponible por permisos. El reporte publicado en Power BI se inspeccionó en Google Chrome el 20/07/2026. Por eso esta ficha distingue entre:

- elementos verificados directamente en la interfaz;
- definiciones reconciliadas contra la API GESI;
- aspectos internos —DAX, Power Query y SQL exacto— que no pudieron inspeccionarse.

La aplicación no consulta Power BI durante su funcionamiento.

## Páginas visibles

1. `INICIO`: portada y navegación.
2. `Vendedor`: indicadores, selector de vendedor y matriz jerárquica vendedor → cliente.
3. `Clientes`: página de consulta orientada al detalle por cuenta.

La adaptación web combina las dos páginas operativas en una sola ventana con vistas `Vendedores` y `Clientes`.

## Filtros observados

Filtros de todas las páginas:

- `FormaDePago`: todos.
- `Pendiente/No Pendiente`: pendiente o vacío.
- `VendedorSuc`: todos en la tabla de saldos.
- `VendedorSuc`: excluye el grupo `MM` en la tabla de vendedores.

El selector visible de la página Vendedor contiene:

- Ana Ottaviano;
- Andres Dominguez;
- Edgardo Larrea;
- Ignacio Carea;
- Julieta Errecart.

Ese universo se conserva explícitamente en v0.2.9. No se agregan vendedores que no estaban en el reporte publicado.

## Métricas verificadas

| Métrica Power BI | Definición usada en la aplicación |
|---|---|
| Saldo Pendiente | Suma del saldo abierto de facturas y notas de débito con vencimiento válido. Recibos y notas de crédito no se suman como deuda. |
| Saldo Vencido | Suma del saldo de comprobantes pendientes cuyo primer vencimiento es anterior al corte. |
| Vdo s/Pend. | Saldo vencido / saldo pendiente. |
| Sum of Dif. Dias | Suma de los días emisión → primer vencimiento de los comprobantes abiertos válidos. |
| Días Prom CC | Promedio de esos plazos por comprobante abierto. |
| # Cli. Vencido | Clientes con al menos un comprobante vencido. |
| Venta Ult. 30 Días | Facturación bruta menos notas de crédito, en una ventana móvil inclusiva de 30 días. |
| Vdo s/Vta 30D | Saldo vencido / venta bruta de 30 días. Si la venta es cero, se informa `Sin ventas 30d`. |

## Cifras testigo observadas

La publicación estaba filtrada por `Edgardo Larrea` y actualizada el 20/07/2026 a las 13:35:24:

- Saldo Pendiente: `$104.882.683`.
- Saldo Vencido: `$30.750.989`.
- Vencido / Pendiente: `29%`.

La captura GESI disponible para la implementación era de las 10:05 del mismo día:

- Saldo Pendiente documental: `$107.437.498,35`.
- Saldo Vencido: `$31.597.928,53`.
- Vencido / Pendiente: `29,41%`.

La cartera documental queda 2,44% por encima del Power BI y el vencido 2,75% por encima. La diferencia es coherente con las tres horas y media de movimientos entre ambos cortes. No se aplica ningún ajuste artificial.

## Conciliación por cliente

| Cliente | Vencimiento | Vencido | Pendiente | Suma plazo | Promedio CC | Venta 30d | Vencido / venta |
|---|---:|---:|---:|---:|---:|---:|---:|
| Masson Guillermo | 03/07/2026 | $786.664 | $1.320.971 | 90 | 30 | $534.307 | 147% |
| Sculli Eduardo Martin | 10/07/2026 | $644.254 | $1.055.549 | 150 | 30 | $411.296 | 157% |
| Salinas Mario Alberto | 12/07/2026 | $381.684 | $673.138 | 60 | 30 | $291.454 | 131% |
| Botta Ayelen | 10/07/2026 | $1.348.965 | $1.348.965 | 90 | 30 | $0 | Power BI: `Infinity`; web: `Sin ventas 30d` |

Las filas se reprodujeron desde saldos, comprobantes pendientes, facturas y notas de crédito de GESI.

## Mejoras incorporadas en v0.2.9

- filtros globales por vendedor, forma de pago y estado del saldo;
- tarjetas que responden al mismo universo;
- composición de saldo pendiente y vencido por vendedor;
- antigüedad de comprobantes en cinco bandas;
- tablas ordenables con tres estados;
- búsqueda por cliente, ID, vendedor o forma de pago;
- acceso directo a la ficha completa y sus gestiones de cobranza;
- reemplazo de `Infinity` por una explicación semántica;
- generación automática de la base del reporte durante `sync:gesi`.

## Limitaciones

- Sin el PBIX no fue posible inspeccionar DAX, relaciones internas ni transformaciones SQL exactas.
- La cartera documental puede diferir del saldo neto de cuenta corriente si existen créditos, recibos o valores todavía sin aplicar.
- La pantalla declara la hora de la captura GESI; una comparación con Power BI sólo es válida si ambos cortes son equivalentes.

## Flujo administrativo v0.4.0

`Administración → Cuentas por cobrar` reutiliza esta cartera sin cambiar sus métricas y la convierte en una bandeja de trabajo. A cada cliente con saldo se le puede asignar responsable, estado interno, próxima fecha y comentarios. Creación, asignación, estado, fecha y comentario se guardan como eventos append-only en `operations.sqlite`.

La pantalla agrega filtros por responsable, estado interno y antigüedad, búsqueda operativa, seguimientos exigibles, cuentas sin gestionar, detalle exacto de documentos y acceso al perfil completo. El estado `Cerrado internamente` no modifica ni cancela una deuda en GESI.

La exportación CSV/XLSX incluye saldo, vencido, antigüedad, documentos, venta 30d y campos de seguimiento; corte, universo y filtros se incorporan como metadatos. Las pruebas reconcilian el tablero contra la implementación de esta ficha y verifican que los documentos abiertos sumen exactamente al saldo de la cuenta.

## Ajuste operativo v0.4.4

La ventana `Centro operativo → Cartera` deja de mostrar comprobantes pertenecientes a clientes inactivos en el maestro GESI. La bandeja administrativa `Cuentas por cobrar` conserva el universo documental de esta ficha para no borrar silenciosamente deuda histórica; son dos superficies con finalidades distintas.

En Cartera, la dimensión temporal se divide en bandas hasta el vencimiento y bandas desde el vencimiento. Es una presentación calculada sobre la fecha exacta de cada comprobante y el corte activo, sin cambiar las métricas conciliadas. Las bandas se pueden combinar con OR dentro de la dimensión y con AND respecto de vendedor, forma de pago, estado y los demás filtros.

## Resumen y gestión v0.8.6

`Reportes → Saldos Pendientes` queda como lectura resumida por vendedor, antigüedad y estado. La tabla operativa por cliente se retira de esa pantalla para evitar duplicar búsqueda, seguimiento y exportación: esas funciones continúan en `Cuentas por cobrar`, que reutiliza este mismo universo documental y sigue siendo el único lugar de gestión.
