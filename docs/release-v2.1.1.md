# Salice Inteligente v2.1.1

Fecha de preparación: 25 de agosto de 2026.

## Objetivo

La v2.1.1 termina de ordenar la experiencia de oficina iniciada en v2.1.0. Inicio pasa a ser una portada navegable del programa, los análisis de producto y las mezclas de reportes priorizan comparaciones legibles, y la logística amplía su cobertura sin alterar estados ni afirmar entregas.

## Inicio y navegación

- Los cuatro indicadores que antes encabezaban Mapa operativo se muestran en Inicio y abren Clientes, Ventas o la pestaña pertinente de Cobranzas.
- Mapa operativo queda concentrado en filtros, clientes y territorio.
- Atención y Comercial comienzan contraídas y se expanden sólo cuando la persona necesita el detalle.
- Accesos rápidos conserva las últimas cuatro pantallas distintas de cada usuario en ese navegador.
- La portada ofrece una tarjeta para cada sección principal. Reportes mantiene una sola entrada porque su propio centro ya organiza todos los informes.
- Vendedores vuelve a **Clientes y ventas**.
- Las pestañas internas de Cobranzas se llaman **Comprobantes** y **Clientes**; los importes documentales y el seguimiento humano continúan separados.
- Los recorridos de Ayuda se amplían a pasos más graduales, con contexto y comprobaciones antes de avanzar.

## Productos

- Demanda y rotación reorganiza período, cobertura, indicadores y comparaciones para responder primero qué se vendió, a cuántos compradores y cómo cambió.
- Precios y evolución separa precio de referencia, precio efectivo y precio por kilo, y aclara cuándo una comparación no es posible.
- Las dos vistas conservan cálculos determinísticos, filtros y estados de cobertura; abrirlas no llama a IA.
- La experiencia móvil usa bloques legibles y controles accesibles sin comprimir tablas ni ocultar salvedades relevantes.

## Reportes

- Volumen SPT reemplaza la barra simple de Mezcla por una lectura por grupo con kilos, participación y comparaciones al mismo día contra mes anterior y año anterior.
- Ventas y composición agrega una Mezcla de facturación para los mismos grupos comerciales de SPT, calculada dentro del universo propio del reporte.
- La fila **Resto de la facturación** conserva la conciliación con el total cuando existen grupos fuera de esa selección.
- Cada reporte explicita período, denominador y disponibilidad de la comparación; no mezcla universos ni completa cifras ausentes.

## Fojas y reparto

La auditoría en vivo confirmó que el problema estaba en el programa y no en esta rama ni en una ausencia general de la fuente. La captura activa contenía sólo 64 fojas y declaraba una cobertura corta desde el 10 de julio: dejaba fuera tanto el histórico anterior como fojas cuyo período seguía dentro de cobertura pero había comenzado antes del corte. El 25 de agosto la consulta ampliada devolvió 1.640 IDs únicos de empresa 3 dentro del año móvil; 94 de esas fojas habían empezado antes del corte anual y seguían solapándolo.

- La cobertura logística pasa al mismo año móvil de las facturas.
- La primera actualización completa el histórico faltante.
- Se consultan 45 días de solapamiento para incluir fojas que comenzaron antes del corte pero terminan dentro de la cobertura.
- Las actualizaciones siguientes conservan únicamente detalles históricos cerrados pertenecientes al paquete activo. Todas las fojas recientes —también las cerradas— y cualquier foja abierta más antigua se vuelven a consultar para captar correcciones posteriores.
- Un caché incompleto, ajeno al paquete activo o ilegible obliga a reconstruir el año; nunca puede publicar 45 días declarando cobertura anual.
- La paginación de fojas es estricta y se controla la continuidad contra el paquete aprobado; una respuesta vacía o parcial conserva el paquete anterior.
- IDs inválidos o duplicados, empresa ajena, detalle incompleto o comprobantes fuera del universo 3/3 bloquean el candidato antes de la activación.
- `pnpm run audit:delivery-sheets` compara cabeceras de la fuente contra el paquete activo sin modificar datos ni exponer credenciales.
- La selección y el orden de facturas muestran razón social como identidad principal; el nombre de fantasía permanece secundario.
- El detalle de una foja permite que **Comprobantes asignados** aproveche el alto disponible y desplace su propia lista cuando corresponde.
- Una foja cerrada continúa significando sólo cierre administrativo de la carga, no expedición ni entrega confirmada.

## Reglas que no cambian

- Los cálculos y universos determinísticos siguen siendo la fuente de verdad.
- Se conserva empresa 3, sucursal 3 y depósito 2 para inventario.
- La IA no modifica cifras, no bloquea el paquete determinístico y no se ejecuta al abrir una pantalla.
- Usuarios, sesiones, objetivos, gestiones, vistas, actividad, alertas y artefactos permanecen fuera de los paquetes comerciales actualizables.
- Continúa una sola instancia con SQLite, disco persistente, programador interno y activación atómica.

## Publicación

Esta rama no realiza merge, push ni despliegue por sí sola. Antes de publicar corresponde verificar Git, sincronización con `main`, pruebas, build, `git diff --check` y ausencia de una actualización de datos en curso.
