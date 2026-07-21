# 004 · Reporte NutriPet

## Propósito

Seguimiento del proveedor NutriPet dentro de Salice: kilos vendidos, cobertura de clientes, avance acumulado, comparación interanual, trimestres y detalle por marca/producto.

Archivo de referencia: `Reporte NutriPet.pbix`, revisado el 20/07/2026. El PBIX se usa para entender reglas, medidas, filtros y cifras testigo; la ventana operativa consulta exclusivamente la base analítica construida desde la API GESI.

## Estructura observada

El reporte tiene una única página, `NutriPet`, con cinco bloques analíticos:

- volumen mensual de los últimos 13 meses;
- porcentaje YTD contra el mismo corte del año anterior;
- volumen por trimestre del año seleccionado;
- clientes únicos por mes;
- clientes YTD actuales y del año anterior.

Filtros de usuario: Año, Mes, Marca, Producto, Línea, Cliente, Agrupación, Rubro y `CanaldeVentaDescrip (NutriPet)`.

## Filtros publicados

- Página: `GrupoArtDescrip = Nutri Pet`.
- Todas las páginas: `Rubro != POP`.
- Todas las páginas: `Cliente != Via Salice MDP S.A.`.
- Marca: sin restricción global.
- Canal predeterminado: `Especializado`.

Agrupación del canal NutriPet:

- `Especializado`: COSTA-RUTA2, Especial, Distribuidor, Freelance, Especializado, Especializado Z2, Partido de la Costa, Refugios, Reventa y Reventa2.
- `Masivo`: On Line, Tienda, Gastronómico, Masivo, Premium, Saludable y Small Retail.
- Los canales no enumerados conservan su nombre original.

La implementación Salice agrega explícitamente empresa 3, sucursal 3 y emisor `Salice Distribuciones S.A.`. El PBIX también contiene movimientos de empresa 7, pero no forman parte del acceso operativo GESI de Salice ni se incorporan a la web.

## Medidas reconstruidas

- Total de kilos: suma neta de `Kilos`, incluyendo notas de crédito con signo negativo.
- Clientes: cantidad distinta de `ClienteID`.
- Mes anterior comparable: mismo número de días del mes anterior cuando el mes actual está en curso.
- Año anterior comparable: mismos días del mismo mes del año anterior.
- YTD: desde el 1 de enero hasta el cierre o fecha de corte seleccionada.
- YTD año anterior: desde el 1 de enero anterior hasta el mismo mes y día.
- Evolución: últimos 13 meses disponibles, independiente del selector Año/Mes, pero afectada por los filtros comerciales.
- Clientes por mes: últimos 12 de esos 13 meses.
- Trimestres: año seleccionado completo hasta la fecha disponible; el mes seleccionado no limita la visual.

## Cifras testigo

La vista dejada abierta en Power BI tenía Año 2026, Mes Jun, Marca MaxPet, Línea Cat y Canal Especializado. GESI empresa 3 reproduce exactamente:

| Mes | Kilos |
|---|---:|
| Oct-25 | 255 |
| Nov-25 | 60 |
| Dic-25 | 60 |
| Ene-26 | 120 |
| Feb-26 | 90 |
| Mar-26 | -15 |
| Abr-26 | 135 |
| May-26 | 60 |
| Jun-26 | 15 |

Otros testigos:

- T-1 2026: 195 kg.
- T-2 2026: 210 kg.
- Clientes YTD a junio: 9.
- Junio 2026: 1 cliente.

Para el corte operativo predeterminado —julio 2026 al día 20, canal Especializado— GESI informa 22.085,1 kg y 135 clientes; YTD 262.326,08 kg y 290 clientes.

## Reemplazo web

La v0.2.5 agrega `Reportes → Reporte NutriPet` con:

- nueve filtros equivalentes a los publicados;
- seis KPI con comparación temporal explícita;
- gráfico interactivo de 13 meses y YTD interanual;
- gráfico interactivo de clientes;
- volumen trimestral;
- tabla sortable de marcas;
- tabla sortable de productos;
- fecha de corte, universo y salvedades de fuente visibles.

La pantalla usa la identidad visual verde/azul de Salice, no la paleta roja del PBIX.

Endpoints: `GET /api/reports/nutripet/meta` y `GET /api/reports/nutripet`.
