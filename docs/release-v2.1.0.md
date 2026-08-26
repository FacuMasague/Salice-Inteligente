# Salice Inteligente v2.1.0

Fecha de preparación: 24 de agosto de 2026.

## Objetivo

La v2.1.0 facilita el trabajo cotidiano de la oficina sin cambiar las reglas comerciales ni los datos que sustentan cada pantalla. La versión reorganiza el acceso, reduce el ruido visual y ofrece caminos más cortos para las tareas frecuentes.

## Inicio

- La aplicación abre en una nueva pantalla llamada **Inicio**.
- Resume promesas que requieren revisión, saldo vencido, oportunidades comerciales altas y alertas de inventario.
- Presenta prioridades y accesos directos a Cobranzas, Bandeja comercial, Productos y Reportes.
- Cada indicador abre el módulo que conserva el detalle completo.
- Inicio es sólo una lectura: no crea tareas, no cambia estados y no modifica importes.

## Navegación de oficina

La barra lateral de acceso rápido se conserva y se reorganiza por finalidad:

- **Trabajo diario:** Inicio, Bandeja comercial y Cobranzas.
- **Clientes y ventas:** Clientes, Ventas, Productos y Marcas.
- **Planificación:** Mapa operativo, Rutas y Vendedores.
- **Reportes:** mantiene el Centro de reportes y todos sus informes.
- **Sistema:** Ayuda, Usuarios, Actividad y Configuración según permisos.

**Saldos pendientes** continúa como reporte independiente. No se mezcló con la operatoria diaria de cobranza.

## Cobranzas

- Cartera y Cuentas por cobrar se presentan como dos pestañas de un único espacio llamado **Cobranzas**.
- **Cartera** conserva importes, vencimientos y comprobantes.
- **Seguimiento** conserva responsables, estados, promesas y próximos pasos.
- Las pantallas y sus responsabilidades siguen separadas internamente para no confundir el saldo comercial con el seguimiento humano.
- Los enlaces existentes a cada tarea continúan abriendo la pestaña correspondiente.

## Vista simple y completa

- En computadoras aparece un selector en la barra superior.
- La **vista completa** es la opción predeterminada.
- La **vista simple** reduce columnas, resúmenes y detalles secundarios en las pantallas más cargadas.
- En teléfonos y pantallas de hasta 900 px se usa siempre la vista simple y el selector se oculta.
- La preferencia se guarda en el navegador y no afecta cálculos ni exportaciones.

## Productos

- **Oportunidades** continúa como una opción principal junto a Inventario, Catálogo y Comparar.
- Demanda y rotación, Precios y evolución y Clasificación avanzada permanecen dentro de **Más análisis**.
- La ficha reemplaza explicaciones técnicas visibles por lenguaje cotidiano.
- El alcance y la calidad técnica del stock quedan disponibles en un detalle plegado al final de la cabecera del producto.

## Alcance de clientes

- El selector deja de ocupar una franja superior en todas las pantallas.
- Se administra desde **Configuración → Preferencias → Alcance de clientes**.
- Mantiene las cuatro opciones existentes y su comportamiento compartido entre las vistas operativas.
- Un cliente con deuda pendiente continúa visible cuando corresponde, aunque no haya comprado recientemente.

## Lenguaje y detalle técnico

- Se redujeron menciones innecesarias al sistema de origen en accesos, estados de carga, fichas y explicaciones cotidianas.
- Los términos de auditoría se conservan en Configuración, Diagnóstico avanzado y notas metodológicas plegadas al final de los reportes.
- Las advertencias que afectan una decisión siguen visibles y no se ocultaron como detalle técnico.

## Ayuda

Los tres tutoriales generales se mantienen sin reemplazos:

- Centro operativo.
- Administración.
- Reportes.

Debajo se agregan cuatro recorridos prácticos más breves:

- Revisar un cliente.
- Registrar una gestión de cobranza.
- Buscar un comprobante de venta.
- Revisar cómo viene el mes.

Los recorridos navegan por las pantallas necesarias y no modifican datos.

## Reglas que no cambian

- La información calculada sigue siendo la fuente de verdad.
- La IA no modifica cifras, universos ni reportes.
- Se conserva el alcance empresa 3, sucursal 3 y depósito 2 para inventario.
- Se mantienen la política documental de cobranzas, las exclusiones y el mínimo de $1.000.
- Se mantienen usuarios, permisos, actividad Developer y alertas técnicas.
- No se modifica la persistencia de notas, gestiones, promesas, objetivos, revisiones, vistas, feedback ni artefactos de IA.
- Continúa una sola instancia en Render con disco persistente y programador interno.
- No se modifica el flujo atómico de actualización de datos.

## Corrección del primer refresco local

- Una carpeta de datos nueva inicia el histórico comercial SPT el 1 de enero de 2025 aunque la variable local de bootstrap todavía no esté declarada.
- La configuración explícita conserva prioridad y producción mantiene el mismo valor definido en Render.
- Esto evita que una primera captura limitada al último año llegue inevitablemente a `sales-audit` sin los primeros meses de 2025.
- El control continúa bloqueando cualquier candidato incompleto; no se relajó ninguna auditoría.

## Publicación

Esta rama no realiza merge, push ni despliegue por sí sola. Antes de publicar corresponde verificar estado de Git, sincronización con `main`, pruebas, build, `git diff --check` y ausencia de una actualización de datos en curso.
