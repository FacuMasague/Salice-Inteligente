# Salice Inteligente v2.1.7

Fecha: 26 de agosto de 2026.

## Resumen

La v2.1.7 restaura la captura anual de comprobantes utilizada antes de v2.1.6 y conserva la primera corrección aplicada a las respuestas lentas: las páginas comienzan en 500 registros y pueden bajar a 250 sin alterar el universo ni aprobar resultados parciales.

Además, una actualización automática que falle específicamente por timeout durante la captura vuelve a ejecutarse una hora más tarde. La cadena admite tres intentos totales y se detiene en cuanto uno finaliza correctamente.

## Reintentos

- Intento inicial en el horario automático correspondiente.
- Segundo intento una hora después si el primero termina por timeout.
- Tercer y último intento una hora después si el segundo también termina por timeout.
- Las auditorías fallidas, los rechazos funcionales, los datos incompletos y cualquier error que no sea un timeout no se reintentan automáticamente.
- Cada intento construye un paquete candidato nuevo; el manifiesto activo sólo cambia después de aprobar todas las etapas determinísticas.
- La interfaz identifica los reintentos como intento 2/3 o 3/3 dentro del historial.

## Continuidad

- Se conserva la normalización segura de fojas cuyo detalle no trae una lista utilizable.
- Se mantienen empresa 3, sucursal 3 y almacén 2.
- No cambia ningún reporte, cifra, permiso ni dato operativo persistente.
- Un fallo de IA continúa sin invalidar el paquete determinístico.

## Verificación

```bash
pnpm test
pnpm run build
git diff --check
```
