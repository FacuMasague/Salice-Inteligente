# Salice Inteligente v1.3.1

## Objetivo

La v1.3.1 traslada a la web la creación y actualización mensual de objetivos comerciales. Reporte General continúa separando los resultados reales de GESI del plan comercial, pero ya no exige preparar ni editar un Excel para publicar un nuevo mes.

## Creación y edición desde la web

Reporte General incorpora **Administrar objetivos** al comienzo de la pantalla. El flujo principal:

1. separa claramente **Editar un mes existente** de **Crear un mes nuevo**;
2. al editar, permite elegir cualquiera de los meses ya cargados;
3. al crear, ofrece los próximos meses disponibles y permite elegir otro mes como base;
4. exige un nombre escrito por la persona para reconocer el objetivo mensual;
5. organiza los productos y rubros en una lista desplazable que aprovecha toda la altura disponible y muestra únicamente sus vendedores, kilos y cuentas editables;
6. mantiene abierta la facturación de Autoservicio para Ana Ottaviano y Julieta Errecart;
7. actualiza los totales antes de guardar;
8. crea y activa una nueva versión completa del plan en una sola transacción.

Guardar desde la web nunca modifica ventas ni movimientos de GESI.

El editor no mantiene listas paralelas: toma los vendedores del alcance comercial común —incluyendo altas futuras válidas de GESI— y los productos/rubros publicados por Reporte General. Las carteras históricas que todavía existen en el Excel se conservan en la revisión original para auditoría, pero no aparecen en la edición, no se copian a un mes nuevo y no participan de los objetivos ni de los resultados actuales.

## Objetivos de clientes

Cada producto o rubro permite editar dos objetivos por vendedor: kilos y clientes. El segundo corresponde a la columna F **Objetivo** de las hojas mensuales de `Objetivos Julio.xlsx`; la columna G **A hoy** no se importa porque el resultado se vuelve a calcular desde GESI.

- junio y julio de 2026 incorporan 2.632 objetivos de clientes dentro del alcance comercial vigente;
- los valores se copian como base al crear un mes nuevo y pueden editarse individualmente;
- Reporte General compara cada objetivo con clientes compradores únicos del mismo mes, producto/rubro y vendedor;
- una misma cuenta puede contar en más de un producto, igual que en los bloques del Excel, por lo que este total no debe confundirse con clientes únicos generales;
- los 510 objetivos históricos de Luciano Payba se conservan solamente en la revisión original del Excel y no participan del plan vigente.

La migración es idempotente y crea una nueva versión activa cuando encuentra una base operativa anterior sin estos valores; no modifica revisiones existentes.

## Historial mensual

La sección **Historial** conserva un registro inmutable por cada objetivo mensual:

- los 19 meses migrados de `Status Salice 2025.xlsx`, desde enero de 2025 hasta julio de 2026;
- cada creación o edición posterior hecha desde la web;
- cada importación histórica adicional que se realice de manera explícita.

Cada registro guarda mes, nombre, origen, autor, fecha, totales y todas sus filas. Un registro anterior puede abrirse como base para una nueva revisión sin sobrescribirlo.

## Migración secundaria desde Excel

**Importar Excel histórico** permanece como una herramienta de migración dentro de la pestaña **Historial**, no como el mecanismo normal de actualización. Reconoce la tabla consolidada `Power BI` de `Status Salice` y la plantilla mensual por producto y vendedor, permite revisar el contenido y conserva las dimensiones ausentes.

## Exportación a Excel

La acción **Exportar objetivos** reemplaza en la cabecera a la importación histórica y descarga un único libro con:

- `Power BI`: el objetivo activo, con las columnas y tipos usados por el Excel actual;
- `Historial`: todos los meses y revisiones conservadas, incluyendo nombre, autor, fecha y estado.

La hoja `Power BI` respeta el alcance comercial vigente. La hoja `Historial` conserva sin alterar las filas originales, incluso cuando pertenecen a una cartera histórica, para que la exportación siga siendo auditable.

La exportación no altera el plan activo ni sus revisiones.

## Selección del plan

El selector superior de Reporte General combina el mes con el nombre asignado a sus objetivos. Es posible consultar el mes actual o cualquier otro mes disponible sin cambiar el origen de los resultados reales.

## Consistencia

Al activar un nuevo objetivo:

- Reporte General lo usa inmediatamente;
- el resumen determinístico “¿Cómo estamos?” recalcula el bloque de objetivos contra el plan activo;
- una narrativa de IA anterior no se reutiliza si su evidencia ya no coincide;
- los demás meses y todos los registros anteriores permanecen intactos.

## Verificación

```bash
pnpm test
pnpm run build
```
