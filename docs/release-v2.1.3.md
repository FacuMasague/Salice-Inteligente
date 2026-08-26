# Salice Inteligente v2.1.3

Fecha de preparación: 26 de agosto de 2026.

## Objetivo

La v2.1.3 hace más predecible la navegación diaria de oficina y corrige puntos de fricción en Inicio, Vendedores, Rutas, Ayuda y dos reportes de mezcla. No modifica universos comerciales, permisos, persistencia operativa ni el proceso de actualización de datos.

## Navegación y continuidad

- Los accesos del menú lateral abren cada sección desde el comienzo, incluso si la persona ya estaba dentro de esa misma pestaña.
- Los accesos contextuales conservan su intención: al abrir un cliente, producto, vendedor, comprobante o foja se presenta directamente el contenido elegido y no una posición de desplazamiento heredada de la pantalla anterior. En móvil, pasar desde una ficha a Productos mantiene visible esa misma ficha; en escritorio posiciona el detalle lateral correspondiente.
- La pestaña activa se refleja en la dirección del navegador y se recuerda por usuario. Al recargar, la aplicación restaura esa pestaña en lugar de volver siempre a Inicio.
- Una dirección inválida o una sección para la cual el usuario no tiene permiso nunca se restaura: la aplicación vuelve de forma segura a Inicio.
- El funcionamiento no depende de que el almacenamiento local del navegador esté disponible.

## Mezcla de ventas y de volumen

- Ventas y composición ordena los grupos desde la mayor hasta la menor participación en facturación.
- Volumen SPT ordena los grupos desde la mayor hasta la menor cantidad de kilos vendidos.
- Los empates tienen un orden estable para evitar cambios visuales arbitrarios entre consultas equivalentes.
- La caja de Mezcla de Ventas y composición adopta la misma estructura visual que Volumen SPT: encabezado destacado, participación visible, cifra actual y comparaciones en bloques equivalentes.
- Sólo cambia la presentación y el orden. Los importes, kilos, porcentajes, períodos y comparaciones continúan saliendo de los cálculos determinísticos del reporte.

## Rutas y fojas

Mapa de fojas mantiene una altura de trabajo acotada en computadoras. Cuando el período contiene muchas fojas, la lista, el detalle de comprobantes y los pendientes se desplazan dentro de sus propios paneles; el mapa y el encabezado general dejan de empujar indefinidamente el resto de la página. En pantallas pequeñas se conserva la disposición vertical adecuada para el uso táctil.

## Vendedores

La lectura de clientes elimina el control vacío que aparecía junto a los filtros y evita que los botones de señal hereden el estado de carga reservado para otra acción. Filtrar por riesgo, oportunidad o prioridad vuelve a ser una operación local e inmediata y conserva una alternativa clara para ver todos los clientes.

## Inicio y Ayuda

- Los accesos de Inicio se distribuyen según el contenido real de cada sección, sin reservar columnas vacías cuando un grupo posee menos destinos.
- Los accesos conservan una jerarquía y un tamaño consistentes, tanto en escritorio como en teléfonos.
- Ayuda ofrece cuatro tutoriales, alineados con la navegación vigente: **Trabajo diario**, **Clientes y ventas**, **Planificación** y **Reportes**.
- Cada recorrido utiliza las pantallas de su sección y conserva el control manual para avanzar, retroceder o salir.

## Reglas que no cambian

- La información determinística sigue siendo la fuente de verdad.
- No cambian el alcance de empresa 3, sucursal 3 ni almacén 2.
- La IA no modifica cifras ni se ejecuta al abrir estas vistas.
- Usuarios, sesiones, objetivos, gestiones, vistas, actividad, alertas y artefactos continúan fuera de los paquetes comerciales actualizables.
- Render continúa con una sola instancia, SQLite, disco persistente, programador interno y activación atómica.

## Publicación

Esta rama no realiza merge, push ni despliegue por sí sola. Antes de publicar corresponde verificar Git, sincronización con `main`, pruebas, build, `git diff --check` y ausencia de una actualización de datos en curso.
