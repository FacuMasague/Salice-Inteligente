# Respaldo de información operativa · v0.3.3

`data/operations.sqlite` contiene notas, tareas, gestiones, promesas e historial de actualizaciones. No forma parte del snapshot GESI y nunca se revierte al cambiar una foto analítica.

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
