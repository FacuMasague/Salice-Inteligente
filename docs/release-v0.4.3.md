# Flujo de cobranzas y comprobantes · v0.4.3

## Alcance

La v0.4.3 consolida el trabajo administrativo de cobranza y elimina la duplicación funcional que existía entre Agenda y Cuentas por cobrar. No cambia el universo financiero ni recalcula saldos: importes, vencimientos y formas de pago continúan viniendo de GESI y de la base analítica activa.

## Cuentas por cobrar

- Los cuadrantes `Sin gestionar`, `Contactar`, `En seguimiento`, `Promesa informada`, `En revisión` y `Cerrado internamente` aplican un filtro exclusivo sobre la bandeja. Al desmarcarlos se recupera el conjunto completo.
- El desglose por estado se calcula después de los filtros de fuente, vendedor, forma de pago, saldo, responsable, antigüedad y búsqueda, pero antes del propio filtro de estado. Por eso todos los cuadrantes siguen siendo navegables.
- `Promesa informada` requiere `promise_amount` y `promise_due_at`. Al salir de ese estado ambos campos se limpian para no presentar compromisos que ya no están vigentes.
- La tabla reserva la interacción de edición para el botón de lápiz. Razón social y vendedor mantienen sus navegaciones de entidad.
- Los seguimientos se registran como eventos. La baja de un evento completa `deleted_at` y `deleted_by`; no se borra físicamente ni se reescribe su contenido original.

## Separación de gestiones

La vista interna que conserva la ruta técnica `agenda` pasa a llamarse `Gestiones comerciales` y vive en Administración. Sólo presenta visitas, llamadas y ofertas. Las tareas originadas por promesas, las cobranzas y los compromisos financieros se trabajan en Cuentas por cobrar.

Los eventos de cobranza activos también se incorporan a la pestaña `Gestiones` del perfil del cliente. Así el perfil reúne contexto comercial y administrativo sin convertir el snapshot GESI en una base editable.

## Comprobantes

`GET /api/invoices/detail?id=...` compone una lectura única con:

- encabezado y estado del comprobante del snapshot operativo;
- saldo abierto y vencimiento de Saldos Pendientes cuando corresponda;
- emisor, sucursal y renglones de producto de la base comercial cuando GESI entregó detalle;
- razón social, nombre comercial, vendedor y domicilio del maestro vigente.

`GET /api/invoices/pdf?id=...` genera un PDF A4 con la misma información y declara explícitamente la falta de renglones. Power BI no participa de ninguna de las dos rutas.

## Verificación

- `pnpm run build` compila TypeScript y la aplicación de producción.
- Las pruebas focalizadas cubren promesas, baja lógica, composición de saldos y detalle unificado de comprobantes.
- La revisión visual recorre Cuentas por cobrar, factura, Gestiones comerciales, filtros de selección única y vista móvil.
- `audit:data`, `audit:operations` y todos los controles obligatorios de `audit:platform` aprueban. Las cuatro advertencias de plataforma corresponden a limitaciones ya conocidas de GESI.

El paquete activo fue actualizado el 21/07/2026. La suite completa conserva cifras testigo exactas del corte anterior (20/07/2026): aprueban 83 de 102 pruebas y fallan 19 aserciones de siete reportes por fecha o valores del nuevo corte. Las ocho pruebas focalizadas de esta entrega aprueban. Esas referencias históricas deben revalidarse y versionarse en una tarea de conciliación separada; no se alteran resultados de GESI para forzar coincidencias.

Las referencias históricas de reportes permanecen en `docs/powerbi`; esta versión no modifica sus universos ni sus definiciones.
