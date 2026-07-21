# Marcas y continuidad operativa · v0.4.1

## Alcance

La v0.4.1 incorpora una entidad navegable de marca, vuelve accionable el indicador de frescura, hace visible la evolución reciente de compra por cliente, conserva la forma de pago documental de las facturas y extiende las vistas guardadas a toda la aplicación.

## Marcas

La ventana `Marcas` se construye exclusivamente con productos y métricas del snapshot GESI activo. Por marca muestra:

- productos maestros, activos y comercializables;
- venta atribuida y unidades de los últimos 90 días;
- rotación mensual observada;
- stock disponible y precio de referencia por producto;
- familias alcanzadas y fecha de última venta;
- participación sobre la venta de 90 días que pudo atribuirse a productos con marca verificable.

`Compradores` es un conteo único dentro de cada producto. No se suma como cobertura única de marca porque un mismo cliente puede comprar varios artículos. La aplicación no infiere marcas ausentes ni completa movimientos sin detalle.

## Evolución de clientes

`salesDelta` compara dos ventanas móviles consecutivas y no superpuestas:

1. venta bruta de los últimos 90 días del snapshot;
2. venta bruta de los 90 días inmediatamente anteriores.

La lista permite filtrar `Aumentó 10%+`, `Cayó 10%+` y `Estable ±9%`, y ordenar por crecimiento o caída. Cuando la base anterior es cero y existe venta actual, la señal se limita a `+100%`; no se presenta una variación infinita.

## Forma de pago documental

La normalización busca `formaDePagoID` en cada factura o comprobante pendiente y lo resuelve contra el maestro de formas de pago de GESI. Si el documento no informa ese campo, se conserva como respaldo explícito la condición actual del cliente. Cartera y los detalles documentales distinguen ambas lecturas cuando son diferentes.

Una captura anterior a v0.4.1 puede no tener el campo normalizado en su snapshot. En ese caso la interfaz mantiene el respaldo de cliente hasta que se apruebe la siguiente actualización; no inventa una forma documental.

## Actualización desde la interfaz

El botón de frescura ejecuta `scripts/refresh-gesi-manual.ts` mediante el mismo Node.js del servidor. El flujo:

1. impide ejecuciones simultáneas;
2. captura y audita GESI;
3. reconstruye snapshot, base comercial y saldos pendientes dentro de un paquete candidato;
4. ejecuta auditorías de datos, vectores y plataforma;
5. activa el manifiesto con una única operación atómica;
6. vuelve a solicitar el dashboard y el estado de datos sin reiniciar el programa.

Si una etapa falla, el paquete candidato no reemplaza la generación activa. La interfaz informa la etapa y el error registrados. Las bases analíticas se recargan al detectar el nuevo archivo activo.

## Vistas guardadas

Cada ventana utiliza una clave independiente. Se guardan filtros, selección de modo o período y cualquier texto de búsqueda visible. Los estados particulares relevantes también se conservan: marca o producto seleccionado, vendedor seleccionado, pestaña de reporte y composición de la ruta.

Las vistas se almacenan en `operations.sqlite`; no modifican GESI y sobreviven a las actualizaciones del snapshot.

## Verificación de cierre

- `pnpm test`
- `pnpm run build`
- `pnpm run audit:data`
- `pnpm run audit:platform`
- revisión visual de escritorio y móvil de Marcas, Clientes, Cartera, actualización y vistas guardadas
