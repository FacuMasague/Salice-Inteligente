# Actualización manual segura · v0.3.0

La actualización sigue siendo manual. No existe programación nocturna, reintento horario ni despliegue remoto en esta versión.

## Comando completo

```bash
pnpm run refresh:gesi
```

Si la ejecución falló después de aprobar la captura y ese archivo pertenece inequívocamente al intento fallido, puede evitarse una nueva descarga completa:

```bash
pnpm run refresh:gesi:resume
```

La reanudación vuelve a auditar la captura y reconstruye todos los artefactos activos. Se rechaza si la falla ocurrió durante la captura, si la auditoría de captura no llegó a aprobarse o si el archivo no corresponde al último intento; en esos casos debe usarse el flujo completo.

El orquestador ejecuta, en orden:

1. captura cruda de GESI;
2. auditoría de completitud de la captura;
3. reconstrucción de `spt-gesi.sqlite`;
4. auditoría de la base comercial;
5. normalización y activación del snapshot y saldos pendientes;
6. auditoría funcional del snapshot;
7. auditoría cruzada de artefactos, cortes y catálogo.

Antes de comenzar respalda `snapshot.json`, staging, base comercial y saldos pendientes. Si una etapa falla, repone esos archivos y registra la etapa y el error en `refresh_runs`, dentro de `operations.sqlite`. Se conservan los tres respaldos integrales más recientes. Una segunda ejecución no puede comenzar mientras exista otra activa; una ejecución interrumpida durante más de doce horas se cierra como fallida antes de liberar el flujo. El historial SPT continúa usando su backfill mensual incremental y reanudable.

El servidor observa la fecha de modificación de las bases analíticas. Cuando un archivo validado es reemplazado, cierra la conexión anterior y abre la nueva en la siguiente consulta sin exigir un reinicio manual.

## Resultado esperado

Una ejecución aprobada debe dejar:

- la misma fecha de captura en snapshot, staging, base comercial y saldos pendientes;
- ningún movimiento posterior al corte del snapshot;
- conteos físicos iguales a la metadata de cada SQLite;
- `data/quality/spt-gesi-audit.json` aprobado;
- `data/quality/platform-audit.json` sin fallas obligatorias;
- un registro exitoso con duración, cobertura y advertencias.

Las credenciales permanecen únicamente en `.env`. Ninguna salida, auditoría o respaldo debe copiar usuario o contraseña.
