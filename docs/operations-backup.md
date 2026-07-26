# Respaldo de información operativa · v0.9.5

`data/operations.sqlite` contiene notas, tareas, gestiones, promesas, historial de actualizaciones y auditoría de IA. No forma parte del snapshot GESI y nunca se revierte al cambiar una foto analítica.

La primera ejecución que detecta un esquema de IA incompleto crea una copia consistente antes de migrarlo. El esquema v0.9.5 exige ocho tablas:

- versiones de prompts;
- ejecuciones;
- artefactos;
- intentos;
- feedback;
- controles de calidad;
- ejecuciones de línea base vectorial;
- productos incluidos en cada línea base.

Prompts, salidas, intentos, feedback, controles de calidad y líneas base quedan protegidos como historia append-only o versionada. Los respaldos locales no deben compartirse porque también contienen información operativa.

## Verificar y respaldar

```bash
pnpm run audit:operations
pnpm run backup:operations
```

El backup ejecuta `integrity_check`, incorpora el WAL mediante una copia consistente con `VACUUM INTO`, vuelve a validar la copia y guarda metadata con fecha, tamaño y SHA-256 en `data/operations-backups/`. Se conservan diez versiones por defecto; `SALICE_OPERATIONS_BACKUP_RETENTION` permite ajustar la retención. `run-salice.command` realiza este backup antes de abrir el servidor.

## Restaurar

Primero hay que cerrar Salice Inteligente. La restauración se rechaza si el lock del servidor corresponde a un proceso activo.

```bash
pnpm run restore:operations -- "/ruta/data/operations-backups/operations-FECHA.sqlite" --confirm
```

Antes de reemplazar la base, el comando valida el backup, realiza un checkpoint, crea `operations.sqlite.pre-restore-FECHA` y valida otra vez el archivo temporal. La copia previa no se elimina automáticamente.
