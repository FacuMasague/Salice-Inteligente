# Salice Inteligente v2.0.0

## Objetivo

La v2.0.0 convierte la interfaz existente en una experiencia utilizable y comprensible desde teléfonos y dispositivos de pantalla angosta. Esta entrega corresponde a la primera parte de v2: adapta el programa actual sin incorporar todavía funciones específicas para vendedores o fleteros.

## Navegación móvil

- La barra superior permanece fija mientras la persona recorre una vista.
- El botón de menú abre la sección de navegación correspondiente y continúa disponible después de hacer scroll.
- Búsqueda global, notificaciones, alcance de clientes y cuenta conservan acceso directo desde la barra superior.
- El menú lateral se comporta como panel superpuesto por debajo de 900 px y no reduce el ancho útil del contenido.
- Se respetan áreas seguras del dispositivo y alturas dinámicas del navegador móvil.

## Filtros y vistas guardadas

- Los filtros de cada módulo se presentan en un panel inferior en pantallas angostas.
- El botón informa cuántos criterios no predeterminados están activos.
- Las búsquedas principales permanecen visibles cuando son necesarias para recorrer resultados.
- El mismo estado y los mismos controles se reutilizan en escritorio y móvil; no existe una segunda lógica de filtrado.
- Los paneles admiten Escape, navegación por teclado, contención de foco, cierre por fondo y restauración del foco al botón de origen.
- Las vistas guardadas continúan perteneciendo al usuario autenticado.

## Superficies densas

- Mapa prioriza la cartografía, oculta los indicadores secundarios y traslada filtros y vistas guardadas al panel móvil.
- La ficha de cliente del mapa se abre como panel inferior y las ubicaciones aproximadas mantienen todas sus advertencias.
- Clientes, Productos y los productos de una Marca usan tarjetas legibles en pantallas angostas.
- Productos adopta un flujo lista → ficha completa en móvil; en escritorio conserva la comparación lado a lado.
- Las tablas que requieren todas sus dimensiones conservan anchos legibles y desplazamiento horizontal visible.
- Los paneles de IA siguen plegados, pero su acceso, texto, límites y acciones tienen tamaños de lectura y toque apropiados.

## Correcciones funcionales incluidas

- El mapa ya no reajusta automáticamente el encuadre por una selección o render que no cambió la geometría visible.
- El mapa invalida su tamaño cuando cambia el contenedor y limpia una ficha si el cliente deja de pertenecer al filtro actual.
- En Rutas, los filtros de chofer, zona y foja sólo afectan al modo Mapa de fojas; el Planificador no queda filtrado por controles invisibles.
- Un cliente inicial enviado a Rutas se consume una sola vez y no vuelve a reemplazar un recorrido que la persona ya armó.

## Accesibilidad y legibilidad

- Los controles móviles principales aumentan su superficie táctil y los formularios evitan el zoom automático de iOS.
- Las tarjetas navegables admiten teclado y nombres accesibles.
- Se evita comprimir columnas hasta recortar datos; cuando una transformación a tarjetas no es adecuada se conserva el scroll horizontal.
- La tipografía decorativa continúa limitada a la identidad visual y el contenido operativo mantiene una fuente profesional.

## Reglas que no cambian

- La información determinística continúa siendo la fuente de verdad.
- No cambian los universos de empresa 3, sucursal 3 y depósito 2 para inventario.
- No cambian cálculos, períodos, reglas documentales, roles, permisos ni endpoints privados.
- La IA no se ejecuta al abrir una vista y una falla de IA no bloquea reportes ni actualizaciones determinísticas.
- Usuarios, sesiones, operaciones, objetivos, vistas, actividad, alertas y artefactos permanecen fuera de los paquetes comerciales reemplazables.
- La arquitectura de producción continúa con una sola instancia, SQLite, disco persistente y programador interno.

## Fuera de alcance

Esta versión no agrega perfiles, permisos, recorridos ni flujos nuevos para vendedores o fleteros. Esa es la segunda parte planificada para v2 y deberá diseñarse sobre esta base móvil sin ampliar silenciosamente el alcance de datos o los permisos actuales.
