# v0.8.3 — Exportaciones útiles y auditables

## Alcance

La versión incorpora descargas sólo cuando el informe completo aporta valor fuera de la aplicación.

- SPT, Mars, NutriPet y Baires generan un único XLSX integral con metadatos, resumen y todos los desgloses completos del reporte.
- Cuentas no compradoras genera un XLSX para la vista activa de cuentas o marcas y respeta filtros, estado de compra y búsqueda. El archivo incluye todas las coincidencias, no sólo las primeras 100 filas visibles.
- Ventas Comercial reutiliza el exportador del Explorador de ventas a nivel renglón de comprobante-producto. El contrato de ese explorador incorpora grupo de artículos para conservar también ese filtro.
- Saldos Pendientes reutiliza el XLSX de Cuentas por cobrar y conserva sus filtros compatibles.
- Reporte General reutiliza el XLSX del plan mensual y el PDF de plan y avance de Objetivos comerciales.

No se agregó una descarga por tarjeta o gráfico. Las acciones siguen concentradas en el bloque de contexto de cada reporte.

## Contrato de los archivos

Cada exportación declara:

- título;
- momento de generación en horario argentino e ISO;
- período;
- fecha de corte;
- universo;
- filtros aplicados;
- fuente;
- advertencias de cobertura o interpretación.

Las tablas se exportan completas, con autofiltros y encabezados fijos. Importes, kilos, unidades, cantidades y porcentajes permanecen como valores numéricos de Excel; el formato visible sigue la convención argentina.

## Límites

- Power BI no participa de la generación ni se convierte en dependencia.
- Los archivos no completan comprobantes omitidos por GESI ni corrigen cifras para forzar conciliaciones.
- El Excel y PDF de Objetivos representan el plan mensual completo; no pretenden reproducir un recorte arbitrario por marca o vendedor del Reporte General.
- No se modificaron métricas, universos analíticos, datos de GESI ni el tutorial.
