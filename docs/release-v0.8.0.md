# Salice Inteligente v0.8.0 — Centro de reportes

## Objetivo

Convertir la sección de reportes en una entrada comprensible para la oficina sin modificar las cifras, universos o fórmulas ya conciliadas.

La versión reorganiza la navegación y expone el contexto que ya acompaña a cada reemplazo de Power BI. No agrega un reporte nuevo ni cambia contratos analíticos.

## Navegación

El menú lateral reemplaza las ocho entradas planas por un único acceso `Reportes`.

El centro agrupa las pantallas existentes por finalidad:

- Dirección: Reporte General.
- Ventas: Ventas · Comercial y SPT Vol vs mes anterior.
- Cartera: Saldos Pendientes y Cuentas no compradoras.
- Negocios y marcas: Mars, NutriPet y Baires.

Cada tarjeta mantiene un botón de acceso directo. Mientras se consulta cualquiera de los ocho reportes, la entrada lateral continúa activa y permite volver al centro.

El Reporte General conserva la vista interna `reports`; el centro usa una vista nueva y separada. Esto mantiene compatible la navegación anterior y evita modificar el tutorial existente.

## Contexto visible

Cada reporte presenta antes de abrirlo:

- la pregunta principal que ayuda a responder;
- el período disponible informado por su endpoint de metadatos;
- la fecha de actualización del artefacto o del paquete activo;
- la fuente operativa;
- las limitaciones relevantes de su universo;
- la cantidad de comprobantes fuente sin detalle, cuando corresponde.

Los metadatos se leen desde los mismos endpoints `/api/reports/*/meta` que consumen las pantallas. Si uno no responde, su tarjeta lo identifica como no disponible en lugar de completar información.

## Favoritos y accesos recientes

La estrella de cada tarjeta permite agregar o quitar un favorito. El centro también conserva los cinco reportes abiertos más recientemente y muestra la fecha y hora del acceso.

Ambas preferencias se guardan en `localStorage` del equipo:

- `salice-report-favorites-v080`;
- `salice-report-recents-v080`.

No se escriben en `operations.sqlite`, no generan actividad humana auditable y no modifican datos de GESI.

Los datos persistidos se validan antes de usarse. Identificadores desconocidos, fechas inválidas y contenido corrupto se descartan sin impedir que abra el programa.

## Contratos técnicos

- `src/views/ReportsHubView.tsx`: catálogo visual, agrupación y lectura de metadatos.
- `src/lib/report-center.ts`: identificadores válidos y reglas de favoritos/recientes.
- `src/App.tsx`: vista del centro, entrada lateral única y navegación a los reportes.
- `src/styles.css`: diseño de escritorio y adaptación de ancho reducido.

Los ocho componentes de reporte, sus endpoints de cálculo, `server/report-universes.ts`, `server/report-metrics.ts` y el catálogo de métricas permanecen sin cambios.

## Límites

- Un favorito o acceso reciente es una preferencia local, no una vista guardada de filtros.
- El centro no implica que los Power BI hayan sido retirados; todavía se requiere aceptación de la oficina.
- Las coberturas entre reportes pueden diferir porque cada uno conserva su universo documentado.
- No se agregan exportaciones, enlaces filtrados entre reportes ni comparadores de períodos en esta versión.
- No se modifica el tutorial.

## Verificación

- Pruebas unitarias sobre favoritos, recientes y datos locales inválidos.
- Compilación TypeScript y build de producción.
- Revisión visual de escritorio con el snapshot activo.
- Comprobación de los ocho accesos, las cuatro agrupaciones y los metadatos obtenidos desde GESI.
- Prueba manual de agregar un favorito, abrir Reporte General y recuperarlo como acceso reciente.
