# Salice Inteligente · v0.3.2

Prototipo web operativo y personalizado para Salice Distribuciones S.A. Permite explorar la cartera sobre un mapa, trabajar una agenda diaria por vendedor, registrar gestiones y promesas de pago, revisar cuenta corriente, generar recomendaciones explicables, planificar visitas y consultar reportes de gestión.

## Abrir el programa

Hacer doble clic en `run-salice.command`. Mientras la ventana de Terminal permanezca abierta, la aplicación queda disponible en:

`http://127.0.0.1:8787`

Para desarrollo, con Node.js 22+ y pnpm:

```bash
pnpm install
pnpm run dev
```

## Estado de los datos

La aplicación usa un **snapshot real de Salice**, capturado desde GESI el 20/07/2026 a las 10:05 de Argentina. La operación general queda fijada a `empresaID=3`, `sucursalID=3` y al depósito principal de Mar del Plata (`depositoID=2`). Los reportes aplican además sus propios universos documentados, sin cambiar la cartera operativa.

Cobertura del snapshot actual:

- 5.713 clientes conservados: 1.910 activos y 3.803 inactivos según el estado actual de GESI.
- 2.468 clientes con coordenadas válidas, de los cuales 877 están activos; el mapa abre en Mar del Plata y zona.
- 13.022 maestros de producto y 1.679 productos comercializables vectorizados.
- 28.963 facturas únicas de los últimos 365 días; 6.279 dentro de la ventana analítica de 90 días.
- 27.524 cobranzas y 26.720 pagos conciliados para calcular comportamiento de pago.
- 995 comprobantes con saldo abierto.
- 28.760 facturas con plazo válido entre compra/emisión y primer vencimiento; 203 quedan fuera porque GESI no informa el primer vencimiento.
- 1.086 clientes con plazo observable; 17 presentan condiciones realmente mixtas.
- 1.497 productos con precio de referencia disponible.

GESI devuelve error para los maestros de zonas y tipos de cliente, y omitió el detalle de dos facturas. También anuncia 13.023 productos pero devuelve de forma estable 13.022; la captura admite esa diferencia de un registro dentro de la tolerancia de datos vivos. El sistema señala estas limitaciones y no inventa los datos faltantes.

La v0.2.3 mantiene el estado 1 como señal de actividad, pero separa una segunda dimensión: 1.354 activos tienen definición explícita para empresa 3 / sucursal 3 y 556 quedan para revisar pertenencia, sin excluirlos automáticamente hasta validar la regla con Salice.

## Qué incluye esta versión

### Productos y vectorización v2.1 · v0.3.2

- Amplía el perfil de 20 a 33 dimensiones, organizadas en seis grupos: especie; edad y tamaño; posicionamiento; tipo de producto; necesidades específicas; proteína o sabor.
- Conserva Cachorros, Adultos y Senior, y agrega porte pequeño, mediano y grande sólo cuando el nombre o un maestro identifica la mascota. El tamaño del envase y la línea `Grandes Animales` no se interpretan como porte.
- Incorpora Esterilizados, Control de peso, Piel y pelaje, Salud urinaria, Salud digestiva y Salud dental. También reconoce pollo, carne vacuna, pescado y cordero exclusivamente en alimentos para mascotas.
- Desarrolla Económico y Premium con dos fuentes separadas: posicionamiento explícito en nombre/maestros y precio de referencia por kilo. El precio relativo se usa sólo en alimentos secos con peso inequívoco y una cohorte mínima de doce productos de igual especie y banda de presentación.
- La similitud penaliza incompatibilidades explícitas de especie, etapa de vida y porte. Un producto sin señal suficiente conserva cero; no se completa por exclusión.

- Corrige la clasificación del catálogo: `brand` ya no reutiliza el subrubro. La ficha muestra por separado marca, línea, rubro, subrubro, familia comercial y grupo tomados de los maestros GESI. En la foto actual hay marca verificable para 1.633 de los 1.679 productos y grupo para 1.513.
- Vectorización determinística v2.1 con coincidencia por términos completos, prioridad de campos estructurados y evidencia visible. Se eliminaron valores por defecto que asignaban atributos sin una señal verificable.
- Similitud v2.1 compuesta por perfil vectorial ponderado (80%) y clasificación comercial (20%). Especie, etapa de vida, porte y tipo de producto pesan más; las incompatibilidades explícitas reciben penalización. La ficha separa similitud, taxonomía y confianza para que el porcentaje sea auditable.
- Información útil por producto: precio de referencia, stock, unidades y venta atribuida de 90 días, clientes compradores, última venta observada y meses estimados de cobertura según rotación reciente.
- Ficha contextual completa sin perder la pantalla de origen. Se abre desde la búsqueda global, recomendaciones, mix de compra de clientes, agenda y tablas de producto de Ventas · Comercial y NutriPet; permite recorrer alternativas cercanas y pasar al catálogo cuando se necesita.
- Catálogo con filtro real por marca, búsqueda ampliada y explorador vectorial con evidencia por afinidad. Los 188 productos sin señales suficientes se conservan con vector vacío y perfil limitado, sin completar datos artificialmente.
- Corrección del selector `MES` de Reporte General: ya no hereda la altura del estilo de filtros anterior y queda alineado con el resto de los controles unificados.

La definición y las limitaciones del motor están documentadas en `docs/product-vectorization-v2.md`.

### Consolidación v0.3.0

- Catálogo central versionado de 17 métricas canónicas y 9 universos de reporte. Cada definición declara fórmula, fuente, grano, fecha, consumidores y salvedades; puede consultarse en Configuración o mediante `GET /api/metrics/catalog`.
- Cortes temporales compartidos para reportes mensuales, anuales, ventanas móviles y comparaciones equivalentes, con pruebas comunes para evitar desvíos entre pantallas.
- Estado visible de datos y fuentes: frescura del snapshot, cobertura comercial, saldos pendientes, auditoría cruzada y limitaciones conocidas de GESI. El umbral predeterminado avisa a las 24 horas y marca desactualización a las 48 horas.
- Flujo manual integral y recuperable: captura, auditoría de captura, reconstrucción comercial, auditoría comercial, normalización, activación y auditorías finales. Conserva la última foto válida, evita dos actualizaciones simultáneas y registra etapa, duración, resultado, advertencias y error.
- Recarga automática de las bases SQLite de reportes cuando sus archivos son reemplazados correctamente; ya no es necesario reiniciar el servidor después de una actualización aprobada.
- Auditoría de plataforma con 17 controles sobre trazabilidad, fechas de corte, conteos físicos, revisión del snapshot y contratos centrales. Las faltas de GESI quedan como salvedades explícitas y no como ajustes artificiales.
- Carga diferida por módulo para reducir el JavaScript inicial y separar mapa, operación y reportes en paquetes independientes.
- Criterios formales para retirar cada Power BI y matriz de exportaciones administrativas previstas, documentados en `docs/powerbi/replacement-criteria.md` y `docs/administrative-exports.md`.

### Funcionalidad consolidada de v0.2

- Tutorial interactivo de 22 pasos desde Configuración, con navegación automática, foco visual y progreso persistente en el equipo.
- Nueva ventana `Vendedores`: resume carteras, ventas de 90 días, vencido, riesgo, oportunidades, evolución mensual, conducta de pago, clientes prioritarios y principales localidades a partir del snapshot GESI.
- Perfil ampliado por cliente con indicadores exactos de cobranza, plazo habitual, vencido, evolución de ventas y conducta contra el vencimiento. En el mapa conserva una ficha compacta con acceso a la vista completa; desde las demás pantallas, el cliente abre directamente su perfil.
- Navegación contextual por vendedor desde tablas y fichas donde representa una entidad operativa; las interacciones propias de gráficos mantienen su función de análisis o filtrado.
- `Reporte General` reemplaza el tablero anterior y adapta Reporte Status Salice: Objetivos kilos, Marcas estratégicas y Autoservicio, con resultado real, plan, cumplimiento, proyección, comparaciones equivalentes, evolución de 13 meses y desgloses ordenables.
- Los resultados del Reporte General se calculan directamente desde GESI. Los objetivos comerciales quedan como configuración de planificación versionada y separada; Power BI se usa únicamente para comprender y conciliar el reporte original.
- Nueva ventana `SPT Vol vs mes anterior`: reconstruye sobre GESI las reglas conciliadas con el primer PBIX y muestra kilos MTD, mes/año anterior, YTD, promedio de tres meses, clientes, unidades, importe neto, evolución diaria y de 13 meses, vendedores y trimestres.
- Gráficos SPT interactivos con detalle exacto al pasar por cada día o mes; Historia comparte ahora el formato de barras, escala y tooltip de Evolución comercial. El detalle diario agrega totales y el ordenamiento de tres estados —ascendente, descendente y original— se reutiliza en Clientes, Cartera y tablas de reportes.
- El gráfico de avance mensual SPT ahora ocupa toda la altura disponible de su cuadrante en escritorio, manteniendo proporciones y textos legibles.
- Nueva ventana `Ventas · Comercial`, reconstruida sobre movimientos GESI: venta neta, comparación equivalente mensual o anual, diferencia y variación, tarjetas de Balanceado/Drovet/Sanitarios/Autoservicio, evolución temporal, composición del negocio y matriz expandible de marcas y productos.
- Los universos de SPT y Ventas Comercial reproducen los filtros visibles verificados el 20/07/2026 en Power BI y quedan definidos por separado para evitar mezclar reglas entre reportes.
- Filtros comerciales globales por frecuencia, período, vendedor, rubro, marca y grupo de artículo. La vista anual compara desde el 1 de enero hasta la fecha cubierta contra los mismos días del año anterior; gráficos, tarjetas y tabla se recalculan juntos.
- La evolución comercial usa un único color base para todos los períodos: el tono oscuro aparece solamente al interactuar con una barra, sin destacar arbitrariamente el último mes.
- Nueva ventana `Reporte Mars`, construida desde GESI para Pet Nutrition: calendario comercial de 13 períodos, modo por cuenta o sucursal, volumen, cobertura, comparaciones interanuales equivalentes, quarters, marcas y tablas auditables.
- Filtros Mars por año, período, sucursal, tipo de cliente, canal agrupado, marca y subrubro. Cada filtro recalcula KPI, gráficos y tablas; los períodos parciales y las salvedades de fuente quedan señalados en pantalla.
- Nueva ventana `Reporte NutriPet`: kilos, clientes, comparaciones equivalentes, evolución de 13 meses, YTD interanual, trimestres y detalle sortable por marca y producto, todo reconstruido desde GESI.
- Filtros NutriPet por año, mes, canal, marca, producto, línea, cliente, agrupación y rubro. El universo excluye POP y Via Salice MDP S.A. y queda restringido a Salice empresa 3 / sucursal 3.
- Nueva ventana `Reporte Baires`: kilos, clientes, comparaciones equivalentes, evolución de 13 meses, YTD interanual, trimestres y detalle ordenable por marca y subrubro, reconstruido desde GESI.
- Filtros Baires por año, mes, segmento Especializado/Masivo, marca, subrubro y sucursal. El universo combina Baires SPT y Baires Masivo, excluye POP y Via Salice MDP S.A. y queda restringido a Salice empresa 3 / sucursal 3.
- Nueva ventana `Cuentas no compradoras`, con vistas de cuentas y marcas, ventanas móviles de 30/90/180 días, promedios de los tres meses calendario completos, distribución por vendedor y detalle operativo buscable y ordenable.
- Los filtros de vendedor, grupo de artículos, rubro y marca recalculan todo el reporte. `AcuerdosComerciales` se señala como no disponible porque el maestro usado por la vista SQL del Power BI no está expuesto por la API GESI; no se inventa una equivalencia.
- Nueva ventana `Saldos Pendientes`: cartera de facturas y notas de débito abiertas, vencido, proporción vencida, ventas brutas móviles de 30 días, antigüedad, formas de pago y vistas ordenables por vendedor y cliente. La ficha del cliente conserva el detalle de comprobantes y las gestiones.
- La relación vencido/ventas ya no presenta `Infinity`: cuando no existe venta en la ventana, la interfaz explica `Sin ventas 30d`. La base analítica se reconstruye automáticamente al activar una nueva captura GESI.
- Base analítica SQLite construida directamente desde facturas, notas de crédito y maestros de la API GESI, limitada a Salice empresa 3. El PBIX queda aislado como referencia de conciliación y nunca se consulta para operar la pantalla.
- Inventario incremental de Power BI en `docs/powerbi`, con los reemplazos web de SPT, Ventas Comercial, Mars, NutriPet, Baires, Cuentas no compradoras, Status Salice y Saldos Pendientes.
- Agenda operativa por fecha y vendedor: combina prioridades algorítmicas, tareas manuales y promesas exigibles, explicando el motivo de cada acción.
- Registro persistente de visitas, llamadas, cobranzas y ofertas, con resultado, importe, productos ofrecidos y próxima acción opcional.
- Promesas de pago con fecha, importe y estado pendiente/cumplida/incumplida; alimentan la agenda y las alertas sin confundirse con dinero cobrado.
- Mapa Leaflet + OpenStreetMap con agrupación de marcadores, filtros y marcador del centro de distribución en Eduardo Bradley 1450.
- Ficha contextual y perfil ampliado del cliente sin perder la pantalla de origen: ventas, señales administrativas, C/O/P, compras, comprobantes, comportamiento contra vencimiento, gestiones y notas persistentes.
- Agenda de cobranzas con filtros, bandas de antigüedad, saldo pendiente real, fechas con año y condición de pago; conserva deuda aunque el cliente esté inactivo.
- Plazo observado por factura calculado como fecha de compra/emisión → primer vencimiento. Cada cliente queda clasificado como sin muestra, muestra única, consistente, predominante o mixto.
- Catálogo vectorizado en 33 dimensiones, filtros por rubro/marca/disponibilidad, orden comercial, comparador v2.1, stock y precio de referencia GESI.
- Explorador explicable de los 33 vectores: grupos, descripción, evidencia y ranking completo del catálogo de afinidad 100 a 0.
- Recomendador explicable: perfil v2.1 ponderado por gasto, compatibilidad de especie, pares confirmados de Salice y confianza confiable/exploratoria/insuficiente.
- Puntajes separados: C para riesgo de cobranza, O para oportunidad comercial y P para prioridad combinada de visita.
- Planificador por vendedor y corredor, con duración por visita, jornada máxima, factor vial visible, alertas de factibilidad y enlaces de navegación.
- Búsqueda global de clientes/productos y bandeja dinámica de promesas exigibles y riesgos de cobranza altos.
- Snapshot GESI de sólo lectura, respaldos automáticos y almacenamiento SQLite separado para notas, tareas, gestiones, promesas y ejecuciones de sincronización.

La IA no interviene en la operación diaria de esta versión. La clasificación de productos se construye mediante reglas reproducibles sobre nombre, descripción, rubro, subrubro, marca, línea, familia comercial, grupo y presentación. Cada afinidad positiva conserva su evidencia; la ausencia de evidencia permanece en cero. Una futura revisión asistida podrá proponer ajustes, pero no modificaría automáticamente los vectores ni los algoritmos operativos.

## Capturar y activar una nueva foto manual

Las credenciales viven únicamente en `.env`, archivo ignorado por Git. `.env.example` contiene la configuración no sensible y nunca debe recibir la contraseña real.

```bash
pnpm run capture:gesi
pnpm run audit:gesi-capture
pnpm run build:spt-gesi
pnpm run audit:spt-gesi
pnpm run sync:gesi
pnpm run audit:data
pnpm run audit:platform
pnpm run audit:client-status
```

También se puede ejecutar el flujo completo con:

```bash
pnpm run refresh:gesi
```

Si el flujo falló después de validar la captura, `pnpm run refresh:gesi:resume` reutiliza únicamente esa captura auditada y reconstruye desde allí las bases activas. La reanudación se rechaza cuando no puede demostrar que el archivo pertenece al intento fallido.

La captura todavía **no está programada diariamente**, de acuerdo con el alcance actual. El flujo separa tres capas para poder auditar y recuperar datos:

```text
GESI (empresa 3 / sucursal 3)
       │
       ▼
data/raw/gesi-salice-latest.json       captura cruda
       │
       ▼
data/staging/snapshot-gesi.json        normalización validada
       │
       ▼
data/snapshot.json                     snapshot activo de la web
       │
       ├── data/backups/                últimos 3 snapshots recuperables
       ├── data/refresh-backups/        respaldo integral temporal del flujo manual
       ├── data/operations.sqlite       notas, agenda, gestiones y promesas
       ├── data/spt-gesi.sqlite         movimientos analíticos operativos desde GESI
       ├── data/pending-balances.sqlite cartera documental del mismo corte
       ├── data/quality/                 auditorías y conciliaciones reproducibles
       └── data/reference/spt-pbix.sqlite  referencia opcional de conciliación
```

Los archivos de datos están ignorados por Git. La activación ocurre solamente después de validar referencias, totales, fechas, vectores y consistencia financiera. Si cualquier etapa falla, el flujo restaura el snapshot y las bases activas que existían al comenzar; el error queda registrado en `operations.sqlite` y visible en Configuración.

La base SPT se actualiza desde GESI. El historial de 2025 se obtiene con un backfill mensual y reanudable: cada mes se guarda antes de avanzar, por lo que una pausa o límite de la API no obliga a comenzar de nuevo.

```bash
pnpm run backfill:spt-gesi
pnpm run build:spt-gesi
pnpm run reconcile:spt
```

El período puede modificarse con `GESI_SPT_BACKFILL_FROM` y `GESI_SPT_BACKFILL_UNTIL`. Las ventanas de cartera, cuenta corriente y compras recientes permanecen en 365/180/90 días; el backfill se guarda en colecciones exclusivas de SPT y no cambia esas métricas. La cobertura analítica actual comienza el 29/12/2024 y usa los filtros vigentes de Salice Inteligente. Los filtros SQL que entregue Administración se incorporarán después como una revisión de reglas, no como requisito para conservar este historial.

El `.pbix` no es una dependencia del programa. Sólo si se recibe una nueva versión de referencia, y después de instalar `pbixray==0.15.1` en un entorno virtual, puede regenerarse su copia aislada con:

```bash
python3 scripts/import-spt-pbix.py "/ruta/al/Reporte SPT Vol vs mes anterior.pbix"
```

La importación crea `data/reference/spt-pbix.sqlite`. `pnpm run reconcile:spt` la compara con `data/spt-gesi.sqlite` y deja evidencia en `data/quality/spt-reconciliation.json`; el servidor sólo abre la base de GESI.

## Criterios de negocio de esta foto

- Se conservan todos los clientes del maestro. El estado 1 de GESI define actividad; la definición empresa 3 / sucursal 3 se muestra por separado como pertenencia confirmada o a revisar.
- Los indicadores operativos, las recomendaciones y los recorridos usan exclusivamente clientes activos. La agenda de cobranzas mantiene cualquier documento abierto, incluso si el cliente pasó a inactivo.
- La facturación de 90 días se reconcilia contra los renglones positivos de producto; conceptos no asignables quedan informados por separado.
- El comportamiento de pago se calcula sólo cuando cobranza, factura y vencimiento pueden vincularse: días desde emisión, días antes/después del vencimiento y porcentaje en término.
- La cuenta corriente no usa `limiteDeCredito_Dias` como duración contractual: la documentación de GESI sólo tipa el campo y los valores no concuerdan de forma estable con las condiciones de pago. El plazo operativo se obtiene de cada factura.
- Para resumir varias facturas, diferencias de hasta 3 días se agrupan como una misma condición probable por corrimientos de calendario. Una opción debe representar al menos 60% para llamarse predominante; de lo contrario, el cliente queda “mixto”. El estado de vencimiento siempre usa la fecha exacta del comprobante.
- El saldo del cliente conserva créditos y anticipos; la agenda muestra únicamente documentos con saldo positivo.
- Como los límites de crédito llegan en cero para toda la cartera activa, la interfaz no presenta porcentajes ficticios de utilización.
- El precio de referencia prioriza el canal especializado de GESI, luego el canal general y finalmente cualquier precio positivo disponible.
- La cobertura de stock de un producto es `stock disponible ÷ unidades medias mensuales de los últimos 90 días`; si no existe rotación suficiente, se muestra como no calculable y no se infiere demanda.
- La similitud de producto no es probabilidad de venta. Combina afinidad vectorial y coincidencias del maestro, mientras que la confianza expresa únicamente la calidad de las señales disponibles.
- Los recorridos parten y regresan al centro de distribución de Eduardo Bradley 1450, Mar del Plata (`-37.9457069, -57.5823923`), estiman distancia vial con un factor explícito y controlan duración de visita/jornada. Todavía no incorporan tránsito ni ventanas horarias.
- Una tarea sólo cuenta como realizada cuando una persona guarda la gestión. La ubicación y la fecha sugerida no se usan para inferir productividad.
- Las promesas exigibles suman compromisos locales pendientes hasta la fecha elegida; no equivalen a cobranzas conciliadas en GESI.
- Los saldos residuales menores a $1.000 siguen visibles en la cuenta, pero no generan por sí solos una tarea o alerta de cobranza.

## Alcance Salice y futura adaptación GBA

Esta solución está deliberadamente orientada a Salice. La configuración, los textos y varias decisiones operativas responden a su sucursal de Mar del Plata. Cuando se encare GBA, la opción prevista es crear una adaptación separada a partir de esta base y validar sus IDs, depósito, reglas comerciales y datos; esta versión no agrega multitenencia ni abstracciones innecesarias.

## Arquitectura

```text
React + Vite
    │
    ├── GET  /api/dashboard
    ├── GET  /api/reports/spt/meta
    ├── GET  /api/reports/spt
    ├── GET  /api/reports/commercial-sales/meta
    ├── GET  /api/reports/commercial-sales
    ├── GET  /api/reports/mars/meta
    ├── GET  /api/reports/mars
    ├── GET  /api/reports/nutripet/meta
    ├── GET  /api/reports/nutripet
    ├── GET  /api/reports/baires/meta
    ├── GET  /api/reports/baires
    ├── GET  /api/reports/non-buyers/meta
    ├── GET  /api/reports/non-buyers
    ├── GET  /api/reports/pending-balances/meta
    ├── GET  /api/reports/pending-balances
    ├── GET  /api/metrics/catalog
    ├── GET  /api/system/status
    ├── GET  /api/system/data-health
    ├── GET  /api/agenda
    ├── POST /api/agenda
    ├── POST /api/activities
    ├── PATCH /api/promises/:id
    ├── GET  /api/notifications
    ├── GET  /api/clients/:id/recommendations
    ├── GET  /api/clients/:id/operations
    ├── PATCH /api/clients/:id/note
    └── POST /api/routes/optimize
             │
       Express + TypeScript
        ┌────┴──────────┬───────────────────┐
        │               │                   │
 data/snapshot.json  operations.sqlite  spt-gesi.sqlite
        │               │                   │
 Captura API GESI   Notas y agenda      Facturas + NC GESI
```

El snapshot JSON sigue siendo adecuado para la foto analítica monousuario; SQLite evita mezclar datos humanos con cada importación. Esta versión todavía no tiene autenticación ni concurrencia multiusuario: antes de varios vendedores conectados al mismo tiempo conviene migrar la interfaz operativa a PostgreSQL y agregar usuarios y roles.

## Verificación

```bash
pnpm test
pnpm run build
pnpm run audit:data
pnpm run audit:spt-gesi
pnpm run audit:platform
```

Las pruebas cubren similitud, compatibilidad de especie, confianza y orden de recomendaciones, exclusión de inactivos, origen de recorridos, promesas vencidas, registro explícito de gestiones, alertas sin duplicados, agrupación de plazos observados, cortes temporales, recarga de SQLite, catálogo central, universos y reconciliación de cifras testigo. Las auditorías reconcilian ventas, saldos, comprobantes, pagos contra vencimiento, plazos, pertenencia Salice, puntajes, vectores, recomendaciones, artefactos activos y supuestos de ruta.
