# Actualización automática y manual segura · v0.11

## Operación normal

En Render, el servidor inicia un programador interno con dos horarios diarios:

- 03:00 de `America/Argentina/Buenos_Aires`;
- 15:00 de `America/Argentina/Buenos_Aires`.

Los horarios no dependen de la zona UTC configurada por Render. Si el servicio vuelve después de haber perdido el último turno, dispara una actualización de recuperación. El bloqueo operativo impide que convivan dos ejecuciones.

La actualización vive dentro del servicio web porque snapshots, paquetes activos, `operations.sqlite`, feedback y resultados de IA comparten el mismo disco persistente. Un Cron Job separado de Render no puede montar ese disco.

Configuración → Datos y actualizaciones muestra si la automatización está activa, sus horarios, la zona horaria, la última activación y la próxima ejecución.

## Ejecución manual

El administrador todavía puede iniciar el mismo flujo desde la interfaz o por terminal:

```bash
pnpm run refresh:gesi
```

Si una ejecución falló después de aprobar la captura, puede reutilizarse únicamente cuando el archivo pertenece inequívocamente al intento fallido:

```bash
pnpm run refresh:gesi:resume
```

## Flujo atómico

El orquestador construye todo dentro de `data/bundles/<ejecución>/`:

1. captura cruda de GESI;
2. auditoría de completitud;
3. base comercial candidata;
4. auditoría comercial;
5. snapshot, staging y saldos pendientes candidatos;
6. auditoría funcional del snapshot;
7. auditoría específica de vectorización;
8. auditoría cruzada de artefactos, cortes y catálogo;
9. resumen ejecutivo “¿Cómo estamos?” calculado contra el paquete candidato;
10. manifiesto con corte, revisión, tamaños y SHA-256;
11. reemplazo atómico de `data/active-bundle.json`;
12. enriquecimiento IA auditable vinculado al snapshot activo;
13. control local de citas, cifras, universos, comparaciones y contradicciones;
14. bloqueo aislado de salidas problemáticas, sin revertir el paquete determinístico;
15. cierre exitoso y recarga del dashboard con resumen e IA ya disponibles.

Después de una activación aprobada, el sistema agrega a `operations.sqlite` una observación append-only de precios por producto. Una ejecución rechazada no incorpora el candidato a esa serie. `pnpm run backfill:prices` puede reconstruir observaciones faltantes únicamente desde snapshots GESI todavía preservados; no inventa puntos intermedios.

Los candidatos nunca son leídos por el servidor antes de aprobarse. Si una etapa falla, se elimina solamente esa generación y el manifiesto activo continúa apuntando al paquete anterior. No existe una ventana en la que el servidor combine una base comercial nueva con un snapshot viejo.

### Sucursal del inventario

La captura contrasta el almacén 2 con el maestro de almacenes de GESI. Si una
fila declara empresa 3/almacén 2 y sucursal exactamente 0, sólo puede completarse
con sucursal 3 cuando el maestro confirma esa relación de forma única y todas
sus cantidades son numéricas. Se conserva la sucursal original y la evidencia
para la auditoría; stock físico, pedidos y disponibilidad no cambian. Otros
alcances, cantidades incompletas o un maestro dudoso siguen bloqueando el
candidato. El detalle está en `docs/fix-inventory-branch-scope.md`.

### Cobertura de fojas

La logística conserva el mismo año móvil que las facturas y consulta además 45 días de solapamiento para no perder una foja que haya comenzado antes del corte pero termine dentro de la cobertura. La primera actualización que detecta una captura antigua limitada a 45 días completa ese histórico.

En las siguientes actualizaciones sólo se conservan fojas históricas cerradas cuya captura coincide con el paquete activo. Todas las cabeceras de la ventana reciente —incluso las cerradas— vuelven a leer su detalle porque la fuente puede corregir asignaciones después del cierre. Una foja abierta más antigua extiende la consulta hasta su fecha. Si el archivo anterior es ilegible, está vacío o no corresponde al paquete activo, se descarta como caché y se reconstruye el año completo.

Antes de integrar el histórico se bloquean IDs inválidos o duplicados y cabeceras de otra empresa. La paginación de fojas debe entregar exactamente todas las filas anunciadas y, si existe un paquete aprobado, ninguna foja que debía volver a consultarse puede desaparecer. Cada foja debe incluir una lista de comprobantes válida, aunque esté vacía, y cada asignación debe corresponder a una factura capturada dentro de empresa 3 / sucursal 3. Las asignaciones anteriores al inicio anual se validan con el tramo auxiliar del solapamiento y luego se excluyen del paquete publicado.

Para comparar, sin modificar datos, las cabeceras que devuelve la fuente con el paquete activo:

```bash
pnpm run audit:delivery-sheets
pnpm run audit:delivery-sheets -- 2026-01-01
```

El segundo comando permite indicar un inicio excepcional. El resultado informa cobertura, cantidad por mes y diferencias de identificadores; nunca imprime credenciales ni contenido comercial de los comprobantes.

## IA incremental

El enriquecimiento comienza después de activar el paquete determinístico. Una falla, omisión por presupuesto o salida inválida de OpenAI queda registrada, pero no revierte los datos aprobados.

Cada trabajo se identifica por función, entidad, versión y hash de evidencia:

- los ocho reportes y “¿Cómo estamos?” se regeneran sólo cuando cambian sus indicadores;
- cada vendedor se evalúa por separado, por lo que un cambio ajeno no invalida su resumen;
- cada cliente de la Bandeja comercial se explica una sola vez y la explicación se conserva en capturas futuras;
- los resultados históricos por lote de versiones anteriores también cuentan como explicaciones existentes;
- productos conserva su línea base y procesa sólo productos realmente nuevos;
- una diferencia de hora de captura sin diferencia de evidencia no invalida un resultado.

Cuando el hash ya existe, el nuevo snapshot recibe una referencia reutilizada y no se llama al proveedor. Si la evidencia cambia, se crea únicamente el trabajo afectado. Los comandos administrativos de IA siguen disponibles:

```bash
pnpm run enrich:ai
pnpm run enrich:ai:resume
```

Los paquetes enviados son agregados y compactos. No incluyen snapshots completos, bases SQLite, credenciales ni archivos fuente. `SALICE_AI_DAILY_BUDGET_USD` limita el gasto total compartido por todas las ejecuciones del día de Argentina y vale USD 1 de forma predeterminada. `SALICE_AI_MAX_COST_USD_PER_RUN` conserva un techo secundario por ejecución. El presupuesto mensual y su umbral de alerta se controlan con `SALICE_AI_MONTHLY_BUDGET_USD` y `SALICE_AI_MONTHLY_BUDGET_WARNING_PERCENT`.

## Persistencia y recuperación

El servidor resuelve snapshot y bases desde el mismo manifiesto. Cuando el puntero cambia, abre las rutas de la nueva generación en la siguiente consulta sin reinicio. Al iniciar vuelve a verificar tamaños y checksums. Se conservan la generación activa y hasta dos anteriores.

Al iniciar, cualquier ejecución que haya quedado abierta por la detención del proceso anterior se cierra como interrumpida. El programador puede entonces recuperar el turno pendiente de inmediato. El historial SPT mantiene su backfill mensual incremental y reanudable.

Una ejecución aprobada debe dejar:

- la misma fecha de captura en snapshot, staging, base comercial y saldos pendientes;
- ningún movimiento posterior al corte del snapshot;
- conteos físicos iguales a la metadata de cada SQLite;
- auditorías SPT, vectorial y de plataforma dentro del paquete;
- un resumen ejecutivo persistido con el mismo corte;
- un manifiesto con checksums válidos;
- un registro exitoso con duración, cobertura y advertencias;
- una ejecución IA completa, parcial, reutilizada u omitida claramente registrada.

Los comandos individuales siguen disponibles para diagnóstico, pero la única operación aprobada para publicar una foto completa es `pnpm run refresh:gesi`. `pnpm run adopt:data-bundle` migra una instalación anterior ya validada al esquema de manifiesto sin consultar GESI.

Las credenciales permanecen en variables de entorno. Ninguna salida, auditoría o respaldo debe copiar usuario, contraseña o clave de OpenAI.

### Corte diario del histórico comercial

El inicio de las consultas de comprobantes se normaliza a medianoche del día de corte. La conservación histórica usa el mismo día: antes del corte se reutiliza; desde el corte se vuelve a consultar. Así se incluyen las emisiones de las 00:00 y no se pierde un día al avanzar la ventana anual.

Las capturas anteriores a la corrección del 1 de octubre de 2026 reconstruyen una vez el histórico completo desde enero de 2025 (o el inicio anterior configurado). Sólo después de aprobar esa captura con `sptHistoryContinuityVersion=1` se habilita la conservación incremental. La auditoría comercial exige esta evidencia; `refresh:gesi:resume` no permite aprobar una captura antigua. Ver `docs/fix-commercial-history-boundary.md`.
