# Salice Inteligente · v0.7.1

Aplicación web operativa y personalizada para Salice Distribuciones S.A. Permite explorar ventas hasta el comprobante, administrar la cartera abierta, versionar objetivos comerciales, reunir señales comerciales y notas de oficina, documentar promesas de pago, generar recomendaciones explicables, revisar facturas para reparto y estimar rutas, y consultar reportes de gestión.

## Abrir el programa

Hacer doble clic en `run-salice.command`. Mientras la ventana de Terminal permanezca abierta, la aplicación queda disponible en:

`http://127.0.0.1:8787`

Para desarrollo, con Node.js 22+ y pnpm:

```bash
pnpm install
pnpm run dev
```

## Estado de los datos

La aplicación usa un **snapshot real de Salice**, capturado desde GESI el 23/07/2026 a las 14:26 de Argentina. La operación general queda fijada a `empresaID=3`, `sucursalID=3` y al depósito principal `Mar del Plata [WPM]` (`depositoID=2`). Los reportes aplican además sus propios universos documentados, sin cambiar la cartera operativa.

Cobertura del snapshot actual:

- 5.721 clientes conservados: 1.919 activos y 3.802 inactivos según el estado actual de GESI.
- 2.474 clientes con coordenadas válidas, de los cuales 883 están activos; el mapa abre en Mar del Plata y zona.
- 13.022 maestros de producto: 1.505 activos y 11.517 inactivos. El catálogo operativo contiene 2.155 productos explicables; 1.280 resultan comercializables con las señales actuales.
- Existencias completas del depósito 2: 903 productos con U1 positiva, 12.072 en cero y 47 con disponibilidad negativa conservada como incidencia; no falta ningún código maestro.
- 6.274 facturas dentro de la ventana analítica de 90 días.
- 26.724 pagos conciliados para calcular comportamiento de pago.
- 949 comprobantes con saldo abierto en el snapshot normalizado.
- 28.724 facturas con plazo válido entre compra/emisión y primer vencimiento.
- 1.090 clientes con plazo observable; 16 presentan condiciones realmente mixtas.
- 1.833 productos del catálogo operativo con precio de referencia disponible.
- Cobertura logística desde el 08/06/2026: 3.068 facturas, 2.488 sin foja y 580 en fojas cerradas. GESI entregó 74 fojas —73 cerradas y una abierta—; la foja abierta no contiene facturas en este corte.

GESI devuelve error para los maestros de zonas y tipos de cliente, y omitió el detalle de dos facturas. También anuncia 13.023 productos pero devuelve de forma estable 13.022; la captura admite esa diferencia de un registro dentro de la tolerancia de datos vivos. El sistema señala estas limitaciones y no inventa los datos faltantes.

La v0.2.3 mantiene el estado 1 como señal de actividad, pero separa una segunda dimensión: 1.354 activos tienen definición explícita para empresa 3 / sucursal 3 y 565 quedan para revisar pertenencia, sin excluirlos automáticamente hasta validar la regla con Salice.

## Qué incluye esta versión

### Comprobantes y fojas navegables · v0.7.1

- El detalle unificado de una factura muestra ahora su estado logístico y, cuando está asignada, permite abrir la foja correspondiente.
- La ficha de foja reúne estado, repartidor, período, cierre, fecha de expedición cuando exista, zona, subzona, comentarios, cantidad de clientes, comprobantes e importe total.
- Cada comprobante de la foja abre el mismo detalle unificado y cada cliente mantiene navegación a su perfil.
- `Centro operativo → Rutas` incorpora un selector para abrir directamente cualquiera de las fojas presentes en el snapshot.
- La navegación es de sólo lectura. Una foja cerrada sigue sin presentarse como envío expedido o entrega realizada.
- Zona, subzona, comentarios y fecha de expedición se incorporan al contrato normalizado desde esta versión; los snapshots anteriores que no los contienen los muestran como no informados hasta una nueva actualización manual aprobada.

La ficha completa está en `docs/release-v0.7.1.md`.

### Rutas de reparto y fojas GESI · v0.7.0

- `Centro operativo → Rutas de reparto` deja de proponer visitas comerciales y trabaja con facturas recientes identificables.
- Cada comprobante conserva un estado explícito: sin asignar, incluido en una foja abierta, incluido en una foja cerrada o desconocido. Una foja cerrada confirma el cierre administrativo en GESI; no prueba que la mercadería haya sido entregada.
- `Cliente → Cuenta corriente → Historial de cuenta` muestra la misma señal junto a cada factura. Los comprobantes anteriores a la cobertura logística se identifican como tales y no se presentan artificialmente como `sin foja`.
- Varias facturas del mismo cliente forman una sola parada. La oficina puede filtrar por fecha, localidad y estado, revisar el detalle del comprobante, ordenar paradas manualmente o pedir una secuencia estimada.
- Los recorridos siempre parten y terminan en el centro de distribución de Eduardo Bradley 1450. Distancia y duración son estimaciones geométricas sin tránsito, capacidad, disponibilidad, ventanas horarias, GPS ni recorrido real.
- La fecha sugerida de reparto muestra la costumbre informada por la oficina: día siguiente, o lunes para facturas de viernes. Es una referencia visible, no una regla ni una asignación automática.
- Clientes sin coordenadas o con dirección dudosa permanecen visibles, pero no se incorporan silenciosamente a una estimación de recorrido.
- La captura manual incorpora fojas completas de GESI. Como el endpoint específico de comprobantes no asignados fue rechazado por GESI, ese universo se deriva de las facturas recientes menos las asignaciones observadas en todas las fojas capturadas y la limitación queda auditada.
- Las notas humanas vinculadas a recomendaciones de productos pueden eliminarse desde `Cliente → Gestiones`. Borrar una nota no elimina la recomendación, el producto ni una lista guardada, y nunca modifica GESI.
- El tutorial fue actualizado con la gestión comercial liviana de v0.6 y este flujo logístico de v0.7.

La ficha completa está en `docs/release-v0.7.0.md`.

### Oportunidades en gestiones y ubicación administrativa · v0.6.5

- `Cliente → Gestiones` incorpora una lista `Oportunidades` que reúne exclusivamente notas humanas vinculadas a productos desde `Productos → Oportunidades`.
- Cada registro muestra la nota, su fecha y el producto relacionado. El nombre del producto abre su ficha existente.
- Las notas vinculadas dejan de repetirse en `Notas sobre hechos externos`; no se crea otra gestión, estado o workflow.
- `Cartera` conserva la misma pantalla y las mismas reglas, pero se mueve de `Centro operativo` a `Administración` en el menú lateral.

La ficha completa está en `docs/release-v0.6.5.md`.

### Cierre de gestión comercial liviana · v0.6.2–v0.6.4

- Las combinaciones de filtros pueden guardarse como listas reproducibles para recuperación de clientes, cobranzas y oportunidades de productos. Son referencias de oficina: no crean campañas, mensajes, gestiones ni estados.
- Las oportunidades explicables pueden vincularse explícitamente con una lista guardada y/o con una nota humana. La nota conserva el cliente y el producto, pero no demuestra contacto, oferta ni resultado.
- `Objetivos` relaciona cada versión seleccionada —activa, borrador o histórica— con resultados reales calculados desde GESI para el mismo mes.
- El seguimiento por vendedor separa objetivo, resultado, diferencia y avance. También muestra clientes con notas, cantidad de notas y oportunidad O alta como señales simples, sin interpretarlas como productividad o etapas de un embudo.
- El embudo comercial detallado permanece suspendido hasta que una necesidad real de Salice justifique sus estados.
- `Cartera para revisar` queda reducida a prioridad P, identidad, localidad y ventas recientes; ya no repite oportunidad ni bloqueo a la derecha.

Las fichas completas están en `docs/release-v0.6.2.md`, `docs/release-v0.6.3.md` y `docs/release-v0.6.4.md`.

### Lectura administrativa de carteras · v0.6.1

- `Vendedores` compara carteras usando exclusivamente clientes activos de GESI e incluye `Sin vendedor` para no ocultar cuentas sin responsable informado.
- Cada vendedor muestra clientes, ventas de 90 días, localidades informadas, riesgo de cobranza, oportunidad alta y prioridad alta.
- La tabla se puede ordenar desde todos sus encabezados: descendente, ascendente y orden original. La ficha de cartera mantiene ventas, cobranza y evolución, y agrega filtros simples para revisar cuentas por C, O o P.
- C, O y P se muestran por separado. No se crea un puntaje adicional ni se interpreta O como oportunidad cuando el cliente está bloqueado o no tiene compras recientes.
- Las localidades provienen del maestro de cada cliente y se agrupan ignorando diferencias de mayúsculas y espacios. No se presentan como territorios, porque GESI continúa sin entregar un maestro de zonas confiable.
- La lectura es informativa: no reasigna clientes, no guarda simulaciones y no genera tareas, comunicaciones o planificaciones.
- La lista `Cartera para revisar` mantiene la prioridad P descendente y no presenta C como dato de la fila.
- La bandeja comercial vuelve a mantener un único orden descendente por P para todos los clientes, sin agrupar primero cobranzas u oportunidades.

Las reglas compartidas están en `shared/portfolio-analysis.ts`, el orden triestado reutiliza `src/lib/sorting.ts` y la ficha completa está en `docs/release-v0.6.1.md`.

### Bandeja comercial semanal · v0.6.0

- `Administración → Bandeja comercial` reúne en una sola lectura señales calculadas, oportunidades de productos, promesas, seguimientos de cobranza, recordatorios históricos y notas de oficina.
- La bandeja trabaja por semana, vendedor, origen y búsqueda. Cada cliente aparece una sola vez aunque reúna varios motivos.
- La base semanal reserva espacio tanto para cobranzas accionables como para oportunidades elegibles. C, O y P permanecen separados y no se crea otro puntaje; desde v0.6.1 todos los clientes se muestran en un único orden P descendente.
- El universo es estrictamente el de clientes activos en GESI, igual que Cartera. Una promesa, recordatorio o nota histórica no reincorpora un cliente inactivo.
- Los clientes bloqueados o sin compras positivas en los últimos 90 días pueden aparecer por cobranza, recordatorios o notas, pero no muestran O ni productos sugeridos.
- La fecha antes presentada como próxima visita se identifica ahora como `Revisión sugerida`: es una referencia algorítmica, no una visita planificada.
- La oficina puede agregar una nota con cliente, fecha, categoría y texto obligatorio para documentar algo ocurrido fuera del sistema.
- Guardar una nota no completa, cancela ni modifica una sugerencia; tampoco crea una próxima tarea, una promesa, una asignación o una comunicación.
- Las promesas y los seguimientos se administran en Cuentas por cobrar. La bandeja sólo los reúne y mantiene navegación a cliente, vendedor, producto, cobranzas y rutas.
- Las oportunidades continúan exigiendo stock positivo, compatibilidad y evidencia visible. Su puntaje ordena, no representa probabilidad de compra ni demuestra que un producto haya sido ofrecido.
- La página puede desplazarse para apartar los controles y aprovechar la altura completa de la pantalla en la lectura de clientes y su detalle.
- Los recordatorios anteriores conservados en `agenda_items` siguen siendo legibles, pero la aplicación ya no ofrece creación de tareas comerciales.

Los contratos están en `server/agenda.ts` y `shared/models.ts`, las notas se persisten mediante `server/operational-store.ts` y la ficha completa está en `docs/release-v0.6.0.md`.

### Ciclo de incidencias de inventario · v0.5.9

- Una revisión de producto ya no queda cerrada para siempre: cada snapshot vuelve a clasificar la señal de inventario sin modificar los valores recibidos de GESI.
- Cuando un problema revisado desaparece, la incidencia se marca como resuelta. Si vuelve en una captura posterior, el producto retorna automáticamente a `Reabierto`, conserva la nota previa y aumenta su número de incidencia.
- Cobertura crítica, baja o quiebre forman una misma familia; cobertura alta y stock sin movimiento forman otra. Cambios menores dentro de la misma familia no reabren trabajo innecesario, pero un tipo de problema diferente sí lo hace.
- La bandeja y la ficha del producto distinguen `No revisado`, `Reabierto`, `En revisión` y `Revisado`. El detalle muestra un historial cronológico de revisiones, resoluciones y reaperturas.
- El historial se guarda de forma append-only en `operations.sqlite`. Las revisiones existentes reciben una línea de base conservadora al migrar, sin reabrirse artificialmente.
- La excepción humana `Discontinuado` conserva su significado y no se reabre automáticamente mientras siga vigente. Ningún cambio local altera stock, productos ni facturas en GESI.

Las reglas compartidas están en `shared/inventory-decisions.ts`, la persistencia en `server/operational-store.ts` y la ficha completa en `docs/release-v0.5.9.md`.

### Oportunidades comerciales de productos · v0.5.8

- Productos suma `Oportunidades`, una superficie centrada en clientes activos con mix observable que separa faltantes recientes, adopción en cuentas comparables, sustitutos ante quiebres y artículos con stock alto que poseen afinidad comercial. Sin compras atribuibles no se inventa una sugerencia.
- Los clientes comparables se ordenan por productos compartidos y señales disponibles de segmento, canal, localidad y zona. La adopción informa numerador, muestra y ejemplos navegables; no se presenta como probabilidad de venta.
- Un sustituto sólo aparece cuando el producto original tuvo demanda reciente, no posee stock positivo y la alternativa coincide en uso y presentación sin incompatibilidades explícitas.
- Toda recomendación exige producto comercializable con stock positivo. Clientes inactivos, maestros inactivos, inventario insuficiente e incompatibilidades explícitas quedan excluidos.
- La afinidad se explica en lenguaje normal, la confianza es visible y la evidencia puede desplegarse. Cliente, vendedor, marca, producto sugerido, producto sustituido y ejemplos comparables son navegables.
- La ficha del Catálogo invierte la misma lectura para cada producto: muestra las cinco mejores cuentas activas que todavía no lo compraron y permite abrir la lista completa, buscarla y navegar al cliente. No incorpora un segundo puntaje ni cambia las exclusiones existentes.
- Las sugerencias no crean tareas ni registran que un producto haya sido ofrecido. Las notas humanas permanecen separadas.

Las reglas ejecutables están en `shared/commercial-opportunities.ts`, sus contratos en `shared/models.ts` y la ficha completa en `docs/release-v0.5.8.md`.

### Precios comparables e historia explícita · v0.5.7

- Productos suma `Precios y evolución` y mantiene tres conceptos separados: referencia GESI, precio efectivo neto observado por U1 y precio normalizado por kilo cuando la presentación lo permite.
- La referencia actual se compara contra el snapshot preservado anterior. La pantalla muestra valor previo, diferencia absoluta, variación porcentual y fecha del último cambio observado, sin reescribir observaciones pasadas.
- El precio efectivo es importe neto facturado dividido por unidades U1 positivas. Usa ventanas equivalentes de 30, 90 o 180 días y publica ventas, unidades, compradores y días activos que sostienen cada resultado.
- El precio por kilo sólo se calcula con contenido neto por U1 verificable. Un alimento seco sin peso inequívoco se marca como presentación ambigua; los demás artículos no comparables conservan el precio por U1.
- Un cambio es fuerte desde ±15%. La referencia puede alertar al comparar dos snapshots; el precio efectivo exige además al menos 5 U1 y 3 días con venta en ambos períodos.
- La historia de referencia se guarda de forma append-only en `operations.sqlite`. Al iniciar se recuperan snapshots GESI preservados en bundles y backups; cada actualización manual aprobada agrega la nueva observación.

Las reglas ejecutables están en `shared/product-prices.ts`, el cálculo en `server/product-price-analysis.ts` y la ficha completa en `docs/release-v0.5.7.md`.

### Demanda y rotación histórica de productos · v0.5.6

- Productos suma `Demanda y rotación`, con ventanas móviles exactas de 30, 90 y 180 días terminadas en la última fecha comercial disponible. Cada ventana se compara con los mismos días inmediatamente anteriores.
- El análisis puede agruparse por producto, marca, familia/rubro y grupo. Compradores se calcula de forma única dentro de cada dimensión y no se obtiene sumando filas que podrían repetir clientes.
- Cada fila muestra unidades U1, compradores, rotación normalizada a 30 días, días desde la última venta y evolución equivalente. Aceleración comienza en +20%, caída en -20% y el intervalo intermedio queda estable.
- La estabilidad usa el coeficiente de variación de unidades sobre tres subperíodos iguales. Distingue rotación estable, variable, intermitente y ausencia de base suficiente.
- `Nuevo observado` significa que la primera venta disponible cae dentro de la ventana y existe un período anterior completo. No se presenta como fecha de alta del maestro porque GESI no entrega esa señal de forma confiable.
- Falta de demanda e historia insuficiente son estados separados. La pantalla muestra los dos cortes comparados, el inicio real de cobertura y todas las reglas exactas, sin pronósticos ni clasificación opaca de IA.

Las definiciones ejecutables están en `shared/product-demand.ts`, el cálculo histórico en `server/product-demand-analysis.ts` y la ficha completa en `docs/release-v0.5.6.md`.

### Comparador operativo de productos · v0.5.5

- Productos suma una sección `Comparar` para trabajar con entre dos y cuatro artículos. La selección puede armarse desde su buscador, el catálogo, una ficha o las alternativas recomendadas; cada columna se cambia o quita sin reiniciar.
- Las sugerencias priorizan compatibilidad de uso, clasificación comercial y presentación. El porcentaje vectorial dejó de ser la única conclusión.
- La tabla se divide en identidad, presentación, precio, inventario, ventas, características, compatibilidades y calidad de datos. Sus encabezados permanecen visibles dentro del desplazamiento.
- `Mostrar sólo diferencias` reduce la tabla sin cambiar la selección. Las ventajas se resaltan únicamente cuando las unidades son comparables; precio por kilo y cobertura explican por qué no pueden contrastarse cuando falta información.
- Cada alternativa se explica frente al producto base mediante compatibilidad de uso, clasificación comercial, presentación, posicionamiento de precio, comportamiento comercial y confianza.
- La selección se conserva al abrir una ficha, regresar, cambiar de sección o recargar el navegador. El detalle de las 33 dimensiones queda detrás de un control técnico opcional.

Las reglas y comprobaciones están en `shared/product-comparison.ts` y `docs/release-v0.5.5.md`.

### Vectorización de productos v2.2 · v0.5.4

- El motor conserva 33 dimensiones descriptivas y suma variantes observadas, negaciones, combinaciones explícitas de especie/etapa/porte y prioridad controlada de maestros estructurados.
- El porte de la mascota se separa del tamaño o peso del envase. Las relaciones U2/U1 verificables tienen prioridad para el contenido; los casos ambiguos permanecen visibles.
- La comparación previa cubrió 2.156 productos: perfiles con señal 1.857 → 1.906, perfiles vacíos 299 → 250 y contradicciones no declaradas 1 → 0.
- Las correcciones humanas requieren dimensión, valor, motivo y autor, conservan historial inmutable y se reaplican después de cada actualización. Ninguna IA puede modificar automáticamente el vector.
- La revisión de inventario permite volver expresamente a `No revisado`, además de `En revisión` y `Revisado`.

Las reglas y comprobaciones están en `docs/product-vectorization-v2.md` y `docs/release-v0.5.4.md`.

### Ficha administrativa de producto · v0.5.3

- La ficha prioriza nombre, marca, presentación, precio, stock U1, rotación, compradores, venta atribuida y última venta. El estado de inventario reutiliza exactamente la clasificación compartida de la bandeja.
- Una lectura rápida traduce las señales verificables a lenguaje cotidiano —por ejemplo, `Alimento seco para perros adultos, segmento premium`— sin completar atributos ausentes.
- La evolución comercial separa los 90 días en tres ventanas móviles consecutivas de 30 días y muestra venta, unidades y compradores. La interfaz aclara que no son meses calendario completos.
- Los clientes compradores se agregan desde los renglones detallados del snapshot, se ordenan por venta atribuida y abren su perfil completo. Marca y rubro/familia también mantienen navegación contextual.
- El catálogo busca además por descripción, presentación, familia comercial y grupo. Suma filtros por línea, estado maestro e inventario, y órdenes por venta, compradores, última venta, stock, precio, rotación, nombre u orden original.
- Las filas del catálogo muestran rotación, compradores, última venta, venta de 90 días, precio y stock para comparar artículos sin abrir cada ficha.
- Las alternativas comerciales conservan una explicación en lenguaje normal. La similitud exacta, la matriz comparativa, los porcentajes, las evidencias y la confianza quedan dentro de `Ver análisis técnico`.
- La ficha muestra el estado vigente de la revisión de oficina y su nota completa. En Clientes compradores, `Ver todos` abre la lista completa de cuentas, con búsqueda y navegación al perfil del cliente.
- Las limitaciones de GESI permanecen visibles: no se infiere discontinuación y no se muestran costo, margen, proveedor ni reposición sin una fuente validada.

Las definiciones, ventanas y comprobaciones están en `docs/release-v0.5.3.md`.

### Bandeja de decisión de inventario · v0.5.2

- Productos abre con una bandeja de inventario para la oficina. Cada artículo queda clasificado como sin stock con demanda, cobertura crítica, baja, adecuada o alta, stock sin movimiento, historia insuficiente, datos insuficientes o fuera de surtido/inactivo.
- La clasificación reutiliza stock U1, rotación y cobertura de v0.5.1. Cada fila explica el motivo con valores exactos; una incidencia de calidad nunca se convierte en una recomendación de compra.
- Los umbrales generales iniciales son explícitos: crítica por debajo de 0,5 mes, baja desde 0,5 hasta menos de 1, adecuada desde 1 hasta menos de 3 y alta desde 3 meses. La política admite futuras diferencias por familia, pero todavía no hay excepciones familiares configuradas.
- Estado, marca, familia/rubro, grupo, actividad, rotación y revisión son filtros combinables. La tabla permite orden ascendente, descendente y original en sus columnas relevantes.
- La bandeja incorpora indicadores por producto, marca y familia. Productos y marcas mantienen navegación contextual; seleccionar una familia concentra la bandeja en esa dimensión.
- El indicador por producto se concentra en artículos con stock positivo o rotación en los últimos 90 días. El orden inicial deja primero los pendientes de mayor impacto —quiebre con demanda, cobertura crítica y cobertura baja—; los artículos sin ambas señales se buscan en el catálogo.
- Un producto sin intervención figura como `No revisado`. Al registrar una revisión puede quedar `En revisión` o `Revisado`, con nota local. La bandeja muestra sólo un extracto de notas extensas y la ficha conserva el texto completo. Las excepciones `Estacional`, `Discontinuado` y `Stock reservado` se guardan en `operations.sqlite`, separadas de GESI. Stock reservado no descuenta unidades porque no se solicita ni inventa una cantidad.
- Los vectores de la ficha quedaron detrás de un control técnico desplegable. El catálogo y las herramientas vectoriales siguen accesibles sin ocupar la vista operativa principal.
- Bandeja, Catálogo y Herramientas técnicas comparten un único selector superior. En escritorio, el menú lateral inicia abierto y puede plegarse desde la barra superior para ampliar el área horizontal de trabajo.
- Esta versión no genera órdenes de compra, no propone cantidades y no infiere proveedores, costos ni reposición.

Las definiciones, precedencias y limitaciones están en `docs/release-v0.5.2.md`.

### Base confiable de productos e inventario · v0.5.1

- La captura de existencias consulta explícitamente productos sin existencia para distinguir un cero observado de una fila ausente. La API se consulta sin `estado=T`, porque el comportamiento real de ese filtro contradice el manual y devuelve un universo vacío.
- Los 13.022 maestros forman el universo de auditoría. El catálogo operativo incluye solamente maestros activos, artículos con venta reciente o artículos con existencia no nula; cada producto conserva el motivo exacto por el que participa.
- Estado de maestro, comercialización observable y discontinuación quedan separados. “Comercializable” significa maestro activo con precio observable. GESI no entrega una marca inequívoca de discontinuación, por lo que no se equipara automáticamente inactivo con discontinuado.
- Stock U1 positivo, cero, negativo y ausente son señales distintas. Los negativos permanecen visibles como incidencia y se usa cero sólo para los cálculos operativos que no admiten disponibilidad negativa.
- Rotación mensual, cobertura y última venta usan definiciones compartidas y auditables. La ficha muestra corte, empresa, sucursal, depósito y calidad de la señal.
- La auditoría informa duplicados, maestros sin fila de existencia, unidades primarias ausentes y relaciones U2/U1 insuficientes.

Las decisiones, universos y limitaciones de esta entrega están en `docs/release-v0.5.1.md`.

### Pruebas estables y conciliaciones versionadas · v0.5.0

- Las pruebas de los siete reportes dejan de esperar cifras del 20/07/2026 mientras consultan el snapshot activo. Los contratos cotidianos validan universos, filtros, cortes equivalentes, desgloses y reconciliaciones internas sobre cualquier captura aprobada.
- Un fixture sintético pequeño, sin clientes ni movimientos reales, prueba cálculos determinísticos de Ventas Comercial, Mars, NutriPet, Baires, Cuentas no compradoras y Saldos Pendientes.
- Las cifras testigo del 20/07/2026 se conservan en un fixture versionado con fecha, revisión y checksums. Sólo se ejecutan cuando está disponible exactamente el paquete histórico que les dio origen.
- Ningún algoritmo, universo ni resultado GESI fue modificado para sanear la suite.

El diseño, el alta de nuevos fixtures y las comprobaciones están en `docs/testing-and-reconciliation.md` y `docs/release-v0.5.0.md`.

### Priorización comercial y vencimientos · v0.4.4

- Las listas `Mayor crecimiento` y `Mayor caída` muestran únicamente clientes con una variación absoluta de al menos 30% entre los últimos 90 días y los 90 anteriores. Un tilde persistente marca cada cliente como revisado y lo mueve detrás de los pendientes sin eliminarlo.
- Cartera excluye comprobantes de clientes inactivos en GESI. La bandeja administrativa de Cuentas por cobrar conserva su universo documental independiente.
- La antigüedad de Cartera se separa en tiempo hasta el vencimiento, con barras verdes, y tiempo transcurrido desde el vencimiento. Las ocho bandas pueden combinarse libremente como filtro.
- Una promesa registrada desde Cuentas por cobrar se materializa también como pago prometido en el perfil, agenda de alertas y consultas operativas. No se confunde con una cobranza conciliada.
- Cada guardado genera un único seguimiento visible. Los eventos técnicos históricos `Estado actualizado` dejan de mostrarse y no vuelven a crearse en las nuevas gestiones.
- Borrar un seguimiento revierte responsable, estado, próxima fecha y promesa al último seguimiento activo; las versiones antiguas guardadas como varios eventos se eliminan como una misma acción.
- Los campos numéricos editables aceptan la convención argentina (`1.234,56`), mientras que las salidas usan punto para miles y coma para decimales.

Las decisiones y comprobaciones de esta entrega están en `docs/release-v0.4.4.md`.

### Flujo de cobranzas y comprobantes · v0.4.3

- Los seis cuadrantes del flujo interno de Cuentas por cobrar son filtros reales de la bandeja y mantienen sus totales comparables mientras se selecciona un estado.
- `Promesa informada` exige importe y fecha. Responsable, estado, próximo seguimiento, promesa y comentario quedan en la capa operativa local, separados del saldo GESI.
- Cada cliente conserva el historial de seguimientos en Cuentas por cobrar y en la pestaña `Gestiones` de su perfil. Una eliminación es lógica: deja marca de fecha y actor para preservar auditoría.
- La razón social y el vendedor navegan a sus fichas. La edición del seguimiento se abre únicamente desde el lápiz ubicado a la derecha de la fila.
- La antigua ventana `Agenda` se reemplazó en v0.4.3 por `Gestiones comerciales`; v0.6.0 la simplifica como `Bandeja comercial`. Las cobranzas y promesas continúan administrándose en Cuentas por cobrar.
- Facturas y notas de crédito abren un panel unificado desde Cartera, Cuentas por cobrar, perfiles y Explorador de ventas. El panel combina encabezado, saldo y renglones disponibles sin inventar faltantes, y genera un PDF A4 trazable.
- Los filtros de selección única usan el mismo componente visual que los filtros combinables. Los formatos compactos conservan el punto de miles argentino en lugar de abreviaciones ambiguas.

Las decisiones, rutas y comprobaciones de esta entrega están en `docs/release-v0.4.3.md`.

### Identidad de clientes y directorio · v0.4.2

- La razón social de GESI pasa a ser el título principal de cada cliente. El nombre de fantasía se muestra como subtítulo cuando es distinto, sin duplicar valores equivalentes.
- La misma regla de identidad se aplica en Clientes, búsqueda global, mapa, perfiles, agenda, rutas, vendedores, cartera, cuentas por cobrar y reportes con entidades navegables.
- La ventana Clientes separa búsqueda, filtros y vistas guardadas en filas estables. Los seis filtros ya no se recortan dentro del ancho útil y la tabla reserva espacio suficiente para razones sociales extensas.
- La regla vive en un único helper probado; el orden alfabético y las etiquetas accesibles también usan la razón social.

Las decisiones y comprobaciones de esta entrega están en `docs/release-v0.4.2.md`.

### Marcas y continuidad operativa · v0.4.1

- Nueva ventana `Marcas`, con directorio buscable, productos vendidos, venta y unidades de 90 días, rotación mensual, stock, disponibilidad, familias, última venta y participación dentro de la venta atribuible del catálogo. La cobertura de compradores se conserva por producto para no presentar como único un cliente repetido entre artículos.
- Los nombres de marca funcionan como entidades navegables desde fichas y listados de producto, búsqueda global, Explorador de ventas, Reporte General, Ventas · Comercial, Mars, NutriPet, Baires y Cuentas no compradoras.
- El indicador de frescura de la esquina superior derecha ejecuta el flujo manual completo de GESI. Captura, audita, reconstruye y publica un paquete nuevo únicamente cuando todos los controles aprueban; una falla conserva la última generación válida y muestra su etapa y error.
- Clientes incorpora filtro y orden por evolución comercial. Compara los últimos 90 días contra los 90 inmediatamente anteriores: `+10%` o más se considera aumento, `-10%` o menos caída y el rango intermedio se muestra como estable.
- La forma de pago se toma del `formaDePagoID` de cada factura cuando GESI lo informa. Cartera, ficha de cliente y detalle de cuentas por cobrar distinguen esa forma documental de la condición configurada actualmente para el cliente.
- Las vistas guardadas están disponibles en todas las ventanas administrativas. Además de filtros y modos, conservan los textos escritos en cada buscador.

Las definiciones y comprobaciones específicas están en `docs/release-v0.4.1.md`.

### Núcleo administrativo · v0.4.0

- Nueva sección `Administración`, separada del centro operativo y de los reportes históricos, con Explorador de ventas, Cuentas por cobrar y Objetivos comerciales.
- Explorador general de ventas con el mismo universo ejecutable de `Ventas · Comercial`. Fecha, vendedor, cliente, producto, marca, rubro, canal y zona recalculan KPI, evolución, clientes, productos y comprobantes. El recorrido baja de indicador a período, cliente o producto, comprobante y renglón exacto.
- Tablero consolidado de cuentas por cobrar: conserva importes, vencimientos y antigüedad de GESI y agrega responsable, estado interno, próxima acción y comentarios en una capa humana separada. Cada cambio genera un evento append-only; cerrar un seguimiento no modifica la deuda GESI.
- Objetivos comerciales administrables en `operations.sqlite`. El plan histórico se importa como versión inicial; las ediciones sólo ocurren en borradores clonados y una activación explícita archiva el plan anterior y cambia lo que consume Reporte General.
- Vistas guardadas por superficie para recuperar filtros frecuentes. Pueden marcarse como favoritas, actualizarse con la combinación actual o eliminarse sin alterar datos de GESI.
- Exportaciones con trazabilidad incluida: Ventas y Cuentas por cobrar en CSV/XLSX; Objetivos en XLSX y PDF A4. Cada archivo declara corte, universo, filtros y fuente.
- Catálogo central ampliado a 24 métricas en v0.5.1. El explorador incorpora comprobantes, ticket promedio y venta neta por kilo; inventario agrega stock U1, rotación, cobertura y última venta sin duplicar definiciones.
- Tutorial ampliado a 25 pasos, interfaz responsive y tres pruebas de contrato específicas para cada módulo administrativo, además de las pruebas de persistencia y reconciliación.

La definición técnica, los estados y las reglas de auditoría están en `docs/administrative-core-v0.4.md`.

### Integridad y trazabilidad · v0.3.3

- Cada actualización manual construye un paquete inmutable con snapshot, staging, base comercial y saldos pendientes. Los cuatro artefactos se auditan antes de publicar un único manifiesto activo mediante reemplazo atómico; una falla deja intacta la generación anterior.
- El manifiesto registra corte, revisión, tamaño y checksum SHA-256 de cada artefacto. El servidor resuelve todos los módulos desde la misma generación y recarga automáticamente cuando cambia el manifiesto.
- Las agregaciones canónicas de kilos, unidades, venta neta y clientes, junto con cumplimiento, variación y participación, se ejecutan desde helpers compartidos. Los universos principales poseen un contrato ejecutable alineado con el catálogo documental.
- `pnpm run audit:vectors` genera cobertura por dimensión, combinaciones declaradas, contradicciones, perfiles de baja confianza, cohortes de precio, cambios frente a la foto anterior, variaciones fuertes de precio por kilo y una muestra de recomendaciones con confianza insuficiente. `pnpm run compare:vectors` contrasta v2.1 contra v2.2 antes de activar el motor nuevo.
- `operations.sqlite` cuenta con verificación de integridad y backup consistente al abrir el programa. Se retienen diez copias fechadas por defecto; la restauración es explícita y crea una copia de seguridad previa.

### Productos y vectorización v2.2 · v0.5.4

- Amplía el perfil de 20 a 33 dimensiones, organizadas en seis grupos: especie; edad y tamaño; posicionamiento; tipo de producto; necesidades específicas; proteína o sabor.
- Conserva Cachorros, Adultos y Senior, y agrega porte pequeño, mediano y grande sólo cuando el nombre o un maestro identifica la mascota. El tamaño del envase y la línea `Grandes Animales` no se interpretan como porte.
- Incorpora Esterilizados, Control de peso, Piel y pelaje, Salud urinaria, Salud digestiva y Salud dental. También reconoce pollo, carne vacuna, pescado y cordero exclusivamente en alimentos para mascotas.
- Desarrolla Económico y Premium con dos fuentes separadas: posicionamiento explícito en nombre/maestros y precio de referencia por kilo. El precio relativo se usa sólo en alimentos secos con peso inequívoco y una cohorte mínima de doce productos de igual especie y banda de presentación.
- La similitud penaliza incompatibilidades explícitas de especie, etapa de vida y porte. Un producto sin señal suficiente conserva cero; no se completa por exclusión.

- Corrige la clasificación del catálogo: `brand` ya no reutiliza el subrubro. La ficha muestra por separado marca, línea, rubro, subrubro, familia comercial y grupo tomados de los maestros GESI.
- Vectorización determinística v2.2 con coincidencia por términos completos, negaciones, combinaciones declaradas, prioridad de campos estructurados y evidencia visible. Se eliminaron valores por defecto que asignaban atributos sin una señal verificable.
- Similitud v2.2 compuesta por perfil vectorial ponderado (80%) y clasificación comercial (20%). Especie, etapa de vida, porte y tipo de producto pesan más; las incompatibilidades explícitas reciben penalización y las combinaciones declaradas no se tratan como contradicción.
- Información útil por producto: precio de referencia, stock, unidades y venta atribuida de 90 días, clientes compradores, última venta observada y meses estimados de cobertura según rotación reciente.
- Ficha contextual completa sin perder la pantalla de origen. Se abre desde la búsqueda global, recomendaciones, mix de compra de clientes, agenda y tablas de producto de Ventas · Comercial y NutriPet; permite recorrer alternativas cercanas y pasar al catálogo cuando se necesita.
- Catálogo con filtro real por marca, búsqueda ampliada y explorador vectorial con evidencia por afinidad. Los 188 productos sin señales suficientes se conservan con vector vacío y perfil limitado, sin completar datos artificialmente.
- Corrección del selector `MES` de Reporte General: ya no hereda la altura del estilo de filtros anterior y queda alineado con el resto de los controles unificados.

La definición y las limitaciones del motor están documentadas en `docs/product-vectorization-v2.md`.

### Consolidación v0.3.0

- El catálogo central comenzó con 17 métricas canónicas y 9 universos de reporte; v0.4.0 lo amplió a 20 y v0.5.1 a 24. Cada definición declara fórmula, fuente, grano, fecha, consumidores y salvedades; puede consultarse en Configuración o mediante `GET /api/metrics/catalog`.
- Cortes temporales compartidos para reportes mensuales, anuales, ventanas móviles y comparaciones equivalentes, con pruebas comunes para evitar desvíos entre pantallas.
- Estado visible de datos y fuentes: frescura del snapshot, cobertura comercial, saldos pendientes, auditoría cruzada y limitaciones conocidas de GESI. El umbral predeterminado avisa a las 24 horas y marca desactualización a las 48 horas.
- Flujo manual integral y recuperable: captura, auditoría de captura, reconstrucción comercial, auditoría comercial, normalización, activación y auditorías finales. Conserva la última foto válida, evita dos actualizaciones simultáneas y registra etapa, duración, resultado, advertencias y error.
- Recarga automática de las bases SQLite de reportes cuando sus archivos son reemplazados correctamente; ya no es necesario reiniciar el servidor después de una actualización aprobada.
- Auditoría de plataforma con 21 controles sobre trazabilidad, fechas de corte, conteos físicos, manifiesto, vectores, persistencia operativa y contratos ejecutables. Las faltas de GESI quedan como salvedades explícitas y no como ajustes artificiales.
- Carga diferida por módulo para reducir el JavaScript inicial y separar mapa, operación y reportes en paquetes independientes.
- Criterios formales para retirar cada Power BI y matriz de exportaciones administrativas previstas, documentados en `docs/powerbi/replacement-criteria.md` y `docs/administrative-exports.md`.

### Funcionalidad consolidada de v0.2

- Tutorial interactivo de 25 pasos desde Configuración, con navegación automática, foco visual y progreso persistente en el equipo.
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
- Bandeja comercial semanal por vendedor: combina señales algorítmicas, oportunidades, promesas, recordatorios y notas sin convertirlos en una planificación.
- Registro persistente de notas sobre visitas, llamadas, ofertas u otros hechos ocurridos fuera del sistema; no comunica ni crea acciones futuras.
- Promesas de pago con fecha, importe y estado pendiente/cumplida/incumplida; alimentan la bandeja y las alertas sin confundirse con dinero cobrado.
- Mapa Leaflet + OpenStreetMap con agrupación de marcadores, filtros y marcador del centro de distribución en Eduardo Bradley 1450.
- Ficha contextual y perfil ampliado del cliente sin perder la pantalla de origen: ventas, señales administrativas, C/O/P, compras, comprobantes, comportamiento contra vencimiento, gestiones y notas persistentes.
- Agenda de cobranzas con filtros, bandas de antigüedad, saldo pendiente real, fechas con año y condición de pago; conserva deuda aunque el cliente esté inactivo.
- Plazo observado por factura calculado como fecha de compra/emisión → primer vencimiento. Cada cliente queda clasificado como sin muestra, muestra única, consistente, predominante o mixto.
- Catálogo vectorizado en 33 dimensiones, filtros por rubro/marca/disponibilidad, orden comercial, comparador operativo de 2–4 productos, stock y precio de referencia GESI.
- Explorador explicable de los 33 vectores: grupos, descripción, evidencia y ranking completo del catálogo de afinidad 100 a 0.
- Recomendador explicable: perfil v2.2 ponderado por gasto, compatibilidad de especie, pares confirmados de Salice y confianza confiable/exploratoria/insuficiente.
- Puntajes separados: C para riesgo de cobranza, O para oportunidad comercial y P para prioridad combinada de visita.
- Planificador por vendedor y corredor, con duración por visita, jornada máxima, factor vial visible, alertas de factibilidad y enlaces de navegación.
- Búsqueda global de clientes/productos y bandeja dinámica de promesas exigibles y riesgos de cobranza altos.
- Snapshot GESI de sólo lectura, respaldos automáticos y almacenamiento SQLite separado para notas, recordatorios históricos, promesas y ejecuciones de sincronización.

La IA no interviene en la operación diaria de esta versión. La clasificación se construye mediante reglas reproducibles y cada afinidad positiva conserva evidencia. Las correcciones de oficina son acciones humanas explícitas con motivo, autor e historial; ninguna IA modifica automáticamente vectores ni algoritmos operativos.

## Capturar y activar una nueva foto manual

Las credenciales viven únicamente en `.env`, archivo ignorado por Git. `.env.example` contiene la configuración no sensible y nunca debe recibir la contraseña real.

La única operación aprobada para publicar una generación completa es:

```bash
pnpm run refresh:gesi
```

El mismo flujo puede iniciarse haciendo clic en la fecha de actualización de la esquina superior derecha. La pantalla informa la etapa actual, vuelve a leer el snapshot aprobado al terminar y no habilita una segunda ejecución simultánea.

Si el flujo falló después de validar la captura, `pnpm run refresh:gesi:resume` reutiliza únicamente esa captura auditada y reconstruye desde allí las bases activas. La reanudación se rechaza cuando no puede demostrar que el archivo pertenece al intento fallido.

La captura todavía **no está programada diariamente**, de acuerdo con el alcance actual. El flujo separa tres capas para poder auditar y recuperar datos:

```text
GESI (empresa 3 / sucursal 3)
       │
       ▼
data/raw/gesi-salice-latest.json       captura cruda
       │
       ▼
data/bundles/<ejecución>/               candidato aislado
       │
       ├── snapshot.json
       ├── snapshot-staging.json
       ├── spt-gesi.sqlite
       ├── pending-balances.sqlite
       ├── quality/
       └── manifest.json
              │
              ▼
data/active-bundle.json                 único puntero activo

data/operations.sqlite                  trabajo humano e historia append-only de precios
data/operations-backups/                copias consistentes de información humana
data/reference/spt-pbix.sqlite          referencia opcional de conciliación
```

Los archivos de datos están ignorados por Git. La activación ocurre solamente después de validar referencias, totales, fechas, vectores y consistencia financiera. Si cualquier etapa falla, el manifiesto conserva la generación anterior sin reemplazar ningún archivo activo; el error queda registrado en `operations.sqlite` y visible en Configuración.

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

La importación crea `data/reference/spt-pbix.sqlite`. `pnpm run reconcile:spt` la compara con la base comercial del paquete activo y deja evidencia en `data/quality/spt-reconciliation.json`; el servidor sólo abre la base de GESI señalada por `data/active-bundle.json`.

## Criterios de negocio de esta foto

- Se conservan todos los clientes del maestro. El estado 1 de GESI define actividad; la definición empresa 3 / sucursal 3 se muestra por separado como pertenencia confirmada o a revisar.
- Los indicadores operativos y las recomendaciones comerciales usan exclusivamente clientes activos. Cuentas por cobrar mantiene cualquier documento abierto y Rutas conserva cualquier factura logística identificable del período, incluso si el cliente cambió de estado después de facturar.
- La facturación de 90 días se reconcilia contra los renglones positivos de producto; conceptos no asignables quedan informados por separado.
- El comportamiento de pago se calcula sólo cuando cobranza, factura y vencimiento pueden vincularse: días desde emisión, días antes/después del vencimiento y porcentaje en término.
- La cuenta corriente no usa `limiteDeCredito_Dias` como duración contractual: la documentación de GESI sólo tipa el campo y los valores no concuerdan de forma estable con las condiciones de pago. El plazo operativo se obtiene de cada factura.
- Para resumir varias facturas, diferencias de hasta 3 días se agrupan como una misma condición probable por corrimientos de calendario. Una opción debe representar al menos 60% para llamarse predominante; de lo contrario, el cliente queda “mixto”. El estado de vencimiento siempre usa la fecha exacta del comprobante.
- El saldo del cliente conserva créditos y anticipos; la bandeja sólo incorpora compromisos de cobranza ya registrados.
- Como los límites de crédito llegan en cero para toda la cartera activa, la interfaz no presenta porcentajes ficticios de utilización.
- El precio de referencia prioriza el canal especializado de GESI, luego el canal general y finalmente cualquier precio positivo disponible.
- La cobertura de stock de un producto es `stock disponible U1 positivo ÷ (unidades U1 vendidas en 90 días / 3)`. No se redondea la rotación antes de dividir; con stock cero, negativo o ausente, o sin rotación positiva, se muestra como no calculable y no se infiere demanda.
- La similitud de producto no es probabilidad de venta. Combina afinidad vectorial y coincidencias del maestro, mientras que la confianza expresa únicamente la calidad de las señales disponibles.
- Los recorridos agrupan facturas por cliente, parten y regresan al centro de distribución de Eduardo Bradley 1450, Mar del Plata (`-37.9457069, -57.5823923`) y estiman distancia vial con un factor explícito y un tiempo administrativo por parada. No incorporan tránsito, capacidad, ventanas horarias, GPS ni prueba de entrega.
- Las señales nunca cuentan como realizadas. Una nota sólo documenta un hecho externo y no se usa para inferir productividad.
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
    ├── GET  /api/admin/sales
    ├── GET  /api/admin/sales/document
    ├── GET  /api/admin/sales/export
    ├── GET  /api/admin/receivables
    ├── PATCH /api/admin/receivables/:clientId
    ├── DELETE /api/admin/receivables/:clientId/events/:eventId
    ├── GET  /api/admin/receivables/export
    ├── GET  /api/invoices/detail
    ├── GET  /api/invoices/pdf
    ├── GET  /api/admin/goals
    ├── POST /api/admin/goals/versions
    ├── PATCH /api/admin/goals/versions/:versionId/rows/:rowId
    ├── POST /api/admin/goals/versions/:versionId/activate
    ├── GET  /api/admin/goals/export
    ├── GET  /api/saved-views
    ├── POST /api/saved-views
    ├── GET  /api/metrics/catalog
    ├── GET  /api/system/status
    ├── GET  /api/system/data-health
    ├── GET  /api/agenda
    ├── POST /api/commercial-notes
    ├── PATCH /api/promises/:id
    ├── GET  /api/notifications
    ├── GET  /api/clients/:id/recommendations
    ├── GET  /api/clients/:id/operations
    ├── DELETE /api/clients/:id/opportunity-notes/:activityId
    ├── PATCH /api/clients/:id/note
    └── POST /api/routes/optimize
             │
       Express + TypeScript
        ┌────┴──────────┬───────────────────┐
        │               │                   │
 paquete activo      operations.sqlite  base comercial del paquete
        │               │                   │
 Captura API GESI   Trabajo humano      Facturas + NC GESI
```

El snapshot JSON sigue siendo adecuado para la foto analítica monousuario; SQLite evita mezclar datos humanos con cada importación. Esta versión todavía no tiene autenticación ni concurrencia multiusuario: antes de varios vendedores conectados al mismo tiempo conviene migrar la interfaz operativa a PostgreSQL y agregar usuarios y roles.

## Verificación

```bash
pnpm test
pnpm run test:reconciliation
pnpm run build
pnpm run audit:data
pnpm run audit:spt-gesi
pnpm run audit:platform
pnpm run audit:vectors
pnpm run compare:vectors
pnpm run audit:prices
pnpm run audit:operations
```

Las pruebas cubren similitud, compatibilidad de especie, confianza y orden de recomendaciones, exclusión de inactivos, bandeja comercial semanal, promesas vencidas, notas sin planificación automática, borrado seguro de notas de oportunidades, agrupación de facturas por parada, secuencia manual y sugerida de repartos, asociación con fojas, fecha sugerida no contractual, alertas sin duplicados, agrupación de plazos observados, cortes temporales, recarga de SQLite, catálogo central, universos y reconciliaciones internas. Las cifras históricas se ejecutan únicamente contra el paquete identificado por su fixture. Las auditorías reconcilian ventas, saldos, comprobantes, pagos contra vencimiento, plazos, pertenencia Salice, puntajes, vectores, recomendaciones, cobertura logística, artefactos activos y supuestos de ruta.
