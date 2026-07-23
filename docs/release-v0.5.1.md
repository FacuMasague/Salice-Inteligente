# Base confiable de productos e inventario · v0.5.1

## Objetivo

Establecer una base explicable antes de construir análisis de quiebres, sobrestock, productos sin movimiento o abastecimiento. Esta entrega no agrega compras, costos, proveedores ni reposición inferida.

## Universos separados

1. **Maestro GESI:** todos los códigos devueltos por `Productos/GetList`. Es el universo de auditoría, no el listado que debe recorrer diariamente un usuario.
2. **Existencias:** una fila por producto para empresa 3, sucursal 3 y depósito 2, solicitada con `incluirProductosSinExistencias=S`.
3. **Catálogo operativo:** unión de maestros activos, productos con venta detallada reciente y productos cuya disponibilidad U1 o U2 es distinta de cero.
4. **Comercializable observable:** producto del catálogo con maestro activo y al menos un precio positivo seleccionable por la regla vigente.

Cada producto del catálogo conserva uno o más motivos: `active_master`, `recent_sale` o `nonzero_inventory`. Un maestro inactivo sin venta reciente ni existencia no nula permanece en el universo auditable, pero no congestiona el catálogo operativo.

## Estados que no se mezclan

- **Activo/inactivo/desconocido:** proviene directamente de `producto.estado`.
- **Comercializable/no comercializable/insuficiente:** clasificación propia y documentada a partir del estado maestro y el precio observable.
- **Discontinuado:** no está disponible como señal inequívoca en la API revisada. La aplicación declara `not_reported`; nunca convierte automáticamente `I` en “discontinuado”.
- **Stock positivo/cero/negativo/ausente:** surge de `unidad1Disponible`. Un negativo se conserva como dato crudo y alerta; la disponibilidad operativa queda en cero.

## Métricas compartidas

- `stock operativo = max(0, unidad1Disponible)`; el valor crudo siempre queda adjunto.
- `unidades 90d = suma de cantidadU1 positiva de facturas con detalle`.
- `rotación mensual = unidades 90d / 3`, sin redondeo previo.
- `cobertura en meses = stock U1 positivo / rotación mensual exacta`; queda nula ante cero, negativo, ausencia o rotación nula.
- `última venta = fecha máxima de factura con ítem de producto e importe neto positivo` dentro del historial efectivamente capturado.

La ficha de producto muestra fecha de corte, empresa, sucursal, depósito, nombre del depósito, completitud de ceros y salvedades específicas.

## Validación de la API

El manual local documenta `incluirProductosSinExistencias=S` para `Productos/GetExistencias`, junto con filtros de sucursal, almacén y estado. Las pruebas de lectura contra GESI confirmaron que incluir ceros funciona. También mostraron que `estado=T`, aunque el manual lo describe como “todos”, devuelve cero filas en el entorno actual. Por eso la captura completa omite ese filtro y clasifica el estado usando el maestro.

La respuesta identifica el depósito `Mar del Plata [WPM]` con `empresaID=3`, `sucursalID=3` y `almacenID=2`. La lectura validada entregó 13.023 filas: 13.022 códigos válidos y únicos más una fila sin `productoID`. La captura contabiliza por separado filas inválidas y duplicadas antes de excluirlas del universo de productos.

## Unidades y limitaciones

La venta y el stock operativo se comparan en U1. `unidad2`, `unidad2XUnidad1`, presentación, embalaje, peso y unidades por caja se conservan como señales separadas; no se fuerza una conversión cuando falta una relación positiva y verificable. La auditoría enumera unidades vacías y productos con U2 sin relación válida.

Un producto puede tener U1 igual a cero y U2 distinta de cero. Por eso `incluirProductosSinExistencias=N` no equivale a “stock U1 positivo” y dejó de usarse como base completa del inventario.

## Criterio de cierre

Un producto sólo participa en el catálogo operativo si posee al menos un motivo explícito. Cada análisis futuro deberá declarar cuál de estos universos consume, su fecha de corte y qué calidad mínima exige. Los análisis de v0.5.2 en adelante deberán reutilizar estas métricas en lugar de redefinirlas por pantalla.

## Resultado validado

El paquete activo de revisión 9 fue capturado el 22/07/2026 a las 10:55 de Argentina y activado atómicamente después de aprobar el flujo manual completo.

- 13.022 maestros únicos: 1.505 activos, 11.517 inactivos y ninguno con estado desconocido.
- 13.022 productos con fila válida de existencias en empresa 3 / sucursal 3 / depósito 2.
- U1 disponible: 898 positivos, 12.076 ceros y 48 negativos visibles como incidencia.
- Catálogo operativo: 2.156 productos; 1.280 comercializables observables; 1.834 con precio.
- Calidad de unidades: 716 maestros sin U1 y 458 con U2 pero sin relación U2/U1 positiva. Permanecen como salvedades y no se completan por inferencia.
- Plataforma: 0 fallas requeridas y 5 advertencias conocidas; inventario, catálogo y métricas agregaron controles obligatorios.
- Suite cotidiana: 115 pruebas aprobadas y ninguna fallida. Las 7 conciliaciones históricas quedaron omitidas porque el paquete exacto del 20/07/2026 no está disponible localmente; el fixture versionado y sus checksums permanecen conservados.
- Build de producción aprobado. Productos y Configuración fueron revisados en la aplicación real; la consola quedó sin errores en una sesión nueva.

Durante la revisión visual se detectó y corrigió un formato de fecha ISO que inicialmente impedía abrir Productos. También se estabilizó la prueba de detalle de comprobante para comparar el identificador documental sin confundir prefijos visuales equivalentes (`FAC B` y `B`).
