# Salice Inteligente v2.1.4

Fecha de preparación: 26 de agosto de 2026.

## Objetivo

La v2.1.4 completa ajustes de distribución visual en Rutas, Marcas, Inicio y Configuración. No modifica universos comerciales, cálculos, permisos, persistencia operativa ni el proceso de actualización de datos.

## Rutas de reparto

- Mapa de fojas reserva más altura vertical para el territorio y sus puntos.
- En computadoras, el crecimiento se obtiene redistribuyendo el espacio del panel: los comprobantes continúan dentro de una lista desplazable y la página mantiene su límite de altura.
- En pantallas apiladas, el mapa también gana altura sin perder el desplazamiento independiente de las listas.

## Marcas

- Cuando el directorio y la ficha están uno junto al otro, la lista de marcas aprovecha toda la altura de la columna de información.
- La lista mantiene desplazamiento interno y deja de terminar antes que la ficha, evitando el bloque vacío inferior.
- Cuando las columnas se apilan, el directorio conserva un máximo propio para no empujar demasiado lejos la marca seleccionada.

## Inicio

El nombre y la explicación de cada grupo de secciones se muestran encima de sus accesos. Los botones continúan distribuyéndose según la cantidad real de destinos, pero ya no compiten horizontalmente con el encabezado del grupo.

## Configuración

La caja de Clientes visibles incorpora márgenes internos consistentes, columnas con ancho mínimo seguro y ajuste de texto. Ninguna opción puede desbordar o superponerse con otra en escritorio, tablet o teléfono.

## Reglas que no cambian

- La información determinística sigue siendo la fuente de verdad.
- No cambian el alcance de empresa 3, sucursal 3 ni almacén 2.
- La IA no modifica cifras ni se ejecuta al abrir estas vistas.
- Usuarios, sesiones, objetivos, gestiones, vistas, actividad, alertas y artefactos continúan fuera de los paquetes comerciales actualizables.
- Render continúa con una sola instancia, SQLite, disco persistente, programador interno y activación atómica.

## Publicación

Esta rama no realiza merge, push ni despliegue por sí sola. Antes de publicar corresponde verificar Git, sincronización con `main`, pruebas, build, `git diff --check` y ausencia de una actualización de datos en curso.
