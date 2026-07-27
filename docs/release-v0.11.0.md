# Salice Inteligente · v0.11.0

## Producción web

- Se incorpora un Blueprint de Render con Node.js fijado, build reproducible, Web Service `pro`, health check y disco persistente de 5 GB.
- El plan de 4 GB se eligió después de medir picos reales de 1,62 GB en la normalización y 1,50 GB en la base comercial, además de la memoria de la web.
- El servidor respeta `PORT` y escucha en `0.0.0.0` dentro de Render.
- Snapshots, paquetes, bases operativas, feedback y artefactos de IA sobreviven reinicios y despliegues.
- Un disco vacío inicia con la vista demostrativa y dispara una actualización inicial sin impedir que el servicio quede saludable.

## Actualizaciones automáticas

- El servidor actualiza todos los días a las 03:00 y 15:00 de `America/Argentina/Buenos_Aires`.
- Los horarios se calculan en la zona argentina y no como horas UTC fijas.
- Al volver de un reinicio, recupera el último turno pendiente.
- El bloqueo existente evita ejecuciones simultáneas.
- Configuración muestra el estado real del programador, su próxima activación y el origen manual, programado o inicial de cada intento.

## IA incremental

- La lectura ejecutiva ignora diferencias puramente temporales de la captura.
- Reportes, lectura ejecutiva y resúmenes se reutilizan mientras su evidencia no cambie.
- Los resúmenes de vendedores se invalidan por vendedor, no por lotes.
- La Bandeja comercial crea un trabajo por cliente nuevo y conserva explicaciones entre snapshots.
- Las explicaciones históricas por lote continúan siendo reconocidas.
- Productos mantiene el comportamiento incremental existente.
- Todo cambio real genera únicamente los trabajos afectados; las reutilizaciones quedan visibles en consumo sin llamar a OpenAI.

## Calidad y seguridad operativa

- Los reportes determinísticos se publican aunque la IA falle o se omita.
- Se mantienen validaciones, presupuestos por actualización y alertas mensuales de v0.9.5.
- Se agregan pruebas de horarios, recuperación, hashes estables, clientes ya explicados, reutilización exacta y cambios reales de evidencia.
