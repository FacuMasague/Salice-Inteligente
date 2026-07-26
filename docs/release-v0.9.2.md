# v0.9.2 — Narrativas almacenadas de reportes

## Reportes incluidos

1. Reporte General.
2. SPT.
3. Ventas Comercial.
4. Mars.
5. NutriPet.
6. Baires.
7. Cuentas no compradoras.
8. Saldos Pendientes.

Cada reporte construye un paquete compacto propio con métricas calculadas, período, universo, comparación, estado parcial, principales desgloses, advertencias e identificadores de evidencia.

Las tablas de movimientos, clientes, documentos, cuentas y productos no se envían. En particular, Cuentas no compradoras y Saldos Pendientes reducen cientos de filas a totales y desgloses agregados por vendedor o antigüedad.

## Contrato de salida

Cada narrativa contiene:

- título y estado actual;
- dos o tres hallazgos;
- impulsores;
- aspectos para revisar;
- limitaciones;
- entre dos y cuatro preguntas frecuentes precontestadas;
- identificadores internos de evidencia.

La validación rechaza referencias inexistentes. La IA no calcula cifras, no altera el reporte y no presenta hipótesis como hechos.

## Navegación

Los endpoints de reporte consultan únicamente `operations.sqlite`. Un artefacto se entrega a la pantalla sólo cuando coinciden:

- función y reporte;
- snapshot activo;
- hash exacto del paquete compacto visible.

Cambiar filtros puede ocultar la narrativa almacenada si ya no corresponde, pero nunca genera una llamada externa.

## Cierre verificado

La ejecución real generó ocho narrativas válidas, una para cada reporte, sin fallos. Una segunda ejecución sobre el mismo snapshot reutilizó las ocho y consumió cero tokens.

