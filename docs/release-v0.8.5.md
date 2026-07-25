# v0.8.5 — Ajustes de uso de Reportes

## Alcance

Esta corrección estabiliza el uso cotidiano de la fase v0.8 sin modificar métricas ni universos.

- La consulta directa de fojas se trasladó desde Rutas al encabezado del Centro de reportes.
- Los bloques comunes de filtros activos y vistas guardadas ocupan todo el ancho disponible, ajustan sus controles y dejan de desbordar o recortarse.
- La navegación hacia otros reportes o módulos aparece antes de las exportaciones. Un separador visual distingue ambas finalidades.
- `Ventas · Comercial` reserva una columna propia para la flecha que despliega productos y evita que se superponga con la marca.
- Los libros Excel usan columnas más amplias para importes, cantidades y fechas; congelan encabezados y conservan fechas y porcentajes como tipos nativos.
- La exportación de Cuentas por cobrar incorpora anchos explícitos para sus 18 columnas y evita la visualización `######` producida por el ancho predeterminado.
- “¿Cómo estamos?” deja de mostrar Inventario para mantener la portada concentrada en ventas, objetivos, recuperación, saldos, vendedores y fojas.
- Las tarjetas del Centro de reportes dejan de repetir advertencias. Las salvedades contractuales continúan dentro de cada reporte y en sus exportaciones.

## Contratos preservados

- No cambian fórmulas, fuentes, períodos, universos ni cifras de los ocho reemplazos de Power BI.
- Una foja cerrada continúa siendo un estado documental y no una confirmación de entrega.
- Los Excel mantienen metadatos de período, corte, universo, filtros, fuente y advertencias.
- El tutorial permanece sin cambios.
