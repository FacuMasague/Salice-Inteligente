# 007 · Reporte Status Salice

## Propósito

Tablero de seguimiento de objetivos comerciales de Salice. El archivo de referencia es `Reporte Status Salice.pbix`, revisado el 20/07/2026 junto con su versión publicada en Power BI.

La adaptación web se denomina **Reporte General** y reúne tres lecturas:

1. **Objetivos kilos:** volumen de las marcas y rubros principales.
2. **Marcas estratégicas:** Fawna, Juvenia Nutrition, MaxPet y Pampa.
3. **Autoservicio:** facturación neta de Ana Ottaviano y Julieta Errecart.

## Páginas del reporte original

- `CARATULA`.
- `Kilos-Objetivos`.
- `Kilos-Estrategicas`.
- `Autoservicio-Facturación`.
- `Salice-Ctas`: página presente en el modelo pero oculta en la publicación. Su objetivo vigente de julio contiene valores de relleno y no se replica como KPI hasta contar con una definición comercial válida.

## Medidas reconstruidas

- **Real kilos:** suma de kilos netos de movimientos GESI.
- **Real Autoservicio:** suma del importe neto de movimientos GESI.
- **Objetivo:** suma del plan comercial del mes seleccionado.
- **Cumplimiento:** real / objetivo.
- **Diferencia:** real - objetivo.
- **Comparación temporal:** real contra el mismo número de días del mes anterior y del año anterior.
- **Proyección lineal:** real / días transcurridos × días del mes. Es una referencia de ritmo, no un pronóstico.

## Universo y filtros

Reglas comunes:

- empresa 3;
- sucursal 3;
- emisor `Salice Distribuciones S.A.`;
- vendedores Ana Ottaviano, Andres Dominguez, Edgardo Larrea, Gonzalo Russian, Ignacio Carea, Julieta Errecart, Luciano Payba y Reventas.

Objetivos kilos:

- rubros GESI `Alimento Húmedo`, `Alimentos Balanceados` y `Snacks` —este último se presenta como `C&T`—;
- marcas Kongo Gold, Old Prince Equilibrium, Old Prince Noveles, Criadores High Pro, Kongo, Raza, Pedigree, Whiskas, Voraz, Criadores Maintenance, Old Prince Premium, Optimum, Company, Origen e Iams;
- `Company` y `Origen` se agrupan como `Company y Origen`.

Marcas estratégicas:

- Fawna, Juvenia Nutrition, MaxPet y PAMPA —presentada como `Pampa`—.

Autoservicio:

- vendedores Ana Ottaviano y Julieta Errecart;
- sin filtro adicional de rubro o marca en el reporte original.

## Separación de fuentes

El PBIX combina una vista SQL derivada de GESI con una tabla de objetivos proveniente de un Excel externo. La aplicación no ejecuta ni consulta el PBIX:

- **resultados reales:** base analítica SQLite construida desde facturas, notas de crédito y maestros de la API GESI;
- **objetivos:** snapshot versionado del plan comercial incluido en el archivo de referencia, con cobertura julio 2025–julio 2026.

Los objetivos de kilos estaban guardados con un centinela `+1` por fila. La importación lo normaliza una sola vez para reproducir los valores mostrados por el reporte publicado; esta transformación queda aislada en la configuración de objetivos.

## Conciliación testigo · julio 2026 al día 20

| Lectura | Real GESI | Real PBIX | Diferencia | Objetivo |
|---|---:|---:|---:|---:|
| Objetivos kilos | 116.871,162 kg | 116.891,162 kg | -20 kg | 249.200 kg |
| Marcas estratégicas | 4.294 kg | 4.294 kg | 0 | 13.800 kg |
| Autoservicio | $45.810.772,354 | $45.810.772,354 | $0 | $85.000.000 |

La diferencia de 20 kg del primer bloque queda dentro de tres comprobantes fuente que GESI informó pero no permitió descargar durante la captura. Se declara en pantalla y no se corrige con un ajuste artificial.

## Mejoras incorporadas en v0.2.8

- una sola pantalla con cambio de lectura, filtros coherentes y colorimetría Salice;
- gráfico interactivo de 13 meses con real, objetivo y cumplimiento exactos;
- comparación contra cortes temporales homogéneos;
- proyección identificada como lineal;
- tablas ordenables por vendedor, marca y rubro;
- contexto operativo adicional de ventas de 90 días, cartera vencida y prioridad comercial;
- trazabilidad visible de fuentes y limitaciones de cobertura.

## Gestión versionada v0.4.0

La tabla histórica dejó de ser una constante consumida directamente por el reporte y se importa una sola vez en `operations.sqlite` como versión 1 activa, con 1.085 filas y su fuente original. La pantalla `Administración → Objetivos comerciales` permite:

- consultar versiones activas, borradores y archivadas;
- clonar cualquier plan disponible como borrador editable;
- agregar, editar o eliminar filas de un borrador;
- auditar actor, fecha, comentario y valores anteriores/posteriores;
- activar explícitamente un borrador, archivando la versión activa anterior;
- exportar el detalle en XLSX y el resumen/cumplimiento en PDF.

Reporte General consulta siempre la única versión activa y recarga fuente, cobertura y objetivos en cada solicitud. Resultados reales, comparaciones y proyección continúan en GESI; activar un plan nunca altera movimientos. Las pruebas existentes conservan las cifras testigo de julio y las nuevas pruebas demuestran clonación, edición, activación, archivo y bloqueo de ediciones posteriores.

## Conexión con Objetivos v0.8.6

El Reporte General explica en su encabezado que los resultados provienen de GESI y que los objetivos pertenecen al plan mensual versionado. Un acceso directo abre `Objetivos comerciales`; la edición y activación de planes no se trasladan al reporte y continúan protegidas por el flujo administrativo existente.
