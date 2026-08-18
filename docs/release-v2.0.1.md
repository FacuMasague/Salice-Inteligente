# Salice Inteligente v2.0.1

## Objetivo

La v2.0.1 corrige la administración de objetivos comerciales cuando una celda de kilos o clientes queda sin completar y audita su uso en Reporte General.

## Objetivos no especificados

- Una celda vacía se representa como `null`; no se convierte silenciosamente en un objetivo cero.
- El valor `0` continúa permitido cuando se desea declarar explícitamente un objetivo nulo.
- Una fila sin producto se reserva exclusivamente para la facturación de autoservicio.
- Kilos y cuentas residuales de filas históricas sin producto se ignoran al leer, editar, exportar y crear una versión nueva.
- Una fila que queda completamente vacía después de normalizarse no se persiste.

## Administración y reportes

- El editor puede abrir y volver a guardar meses que contienen filas históricas de facturación sin disparar la validación de producto.
- La importación normalizada descarta kilos y cuentas presentes por error en una fila de facturación sin producto.
- El servidor vuelve a normalizar la solicitud antes de versionar y activar el mes.
- Reporte General sólo utiliza objetivos de kilos y clientes que tienen simultáneamente mes, producto y vendedor válidos.
- La facturación de autoservicio continúa calculándose por mes y vendedor sin exigir producto.
- El editor y Reporte General comparten la misma definición de vendedores de autoservicio.
- Cada guardado conserva una revisión mensual inmutable y activa una versión completa de manera atómica.

## Reglas que no cambian

- Los resultados reales continúan proviniendo de GESI y no se modifican desde el editor de objetivos.
- Se conservan los productos, rubros, vendedores, meses calendario y universos comerciales vigentes.
- No se modifica información operativa persistente durante la actualización de la aplicación.
