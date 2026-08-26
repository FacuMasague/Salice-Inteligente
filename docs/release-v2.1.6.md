# Salice Inteligente v2.1.6

Fecha: 26 de agosto de 2026.

## Resumen

La v2.1.6 corrige una falla observada en Render durante la captura automática de facturas. GESI agotaba el tiempo de espera al intentar construir una página de 1.000 comprobantes y, luego de cinco reintentos idénticos, el paquete candidato se descartaba correctamente sin reemplazar el manifiesto activo.

## Corrección

- Las consultas de cabeceras de facturas y notas de crédito se dividen por mes calendario y comienzan con páginas de 250 registros. En producción se comprobó que una consulta anual agotaba el timeout incluso con páginas de 250 antes de entregar la primera respuesta.
- Los resultados mensuales se consolidan por identidad documental antes de continuar; el universo y las auditorías siguen siendo los mismos que en la consulta histórica completa.
- Si una colección POST agota sus reintentos por timeout, conexión interrumpida o error transitorio del servidor, la captura completa se reinicia con la mitad del tamaño de página.
- Para otras colecciones POST, el descenso adaptativo puede continuar de 1.000 a 500 y luego a 250 registros.
- La colección se reinicia desde la primera página para evitar huecos o duplicados al cambiar la paginación.
- Las verificaciones de completitud siguen activas: reducir el lote no permite aprobar una captura parcial.
- Los errores no transitorios y los rechazos funcionales continúan bloqueando el candidato.

## Seguridad operativa

- No cambia el universo de empresa 3, sucursal 3 ni almacén 2.
- No cambia cifras, reportes, permisos ni datos persistentes.
- La activación continúa siendo única y atómica.
- Una captura fallida continúa conservando el paquete determinístico anterior.
- La corrección no depende de IA.

## Verificación

La entrega debe validar:

```bash
pnpm test
pnpm run build
git diff --check
```

La prueba específica simula cinco timeouts consecutivos con páginas de 1.000 registros y verifica que la captura se reinicie y complete con páginas de 500.
