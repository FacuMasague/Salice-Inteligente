# Salice Inteligente v1.2.1

## Rol Developer

- Se agrega `developer` junto a Administrador y Oficina.
- Developer conserva las funciones administrativas y accede a **Sistema → Actividad de usuarios**.
- Sólo otro Developer puede otorgar, quitar o modificar ese rol.
- El administrador inicial puede crearse como Developer mediante `SALICE_INITIAL_ADMIN_ROLE=developer`.
- `Facu Masague` queda como Developer en la base operativa local.

## Actividad y auditoría

- Cada inicio de sesión registra fecha, dirección de conexión y navegador informado.
- El tiempo activo se acumula mediante pulsos asociados a la sesión.
- El navegador deja de enviar tiempo después de cinco minutos sin teclado, mouse, scroll, toque o visibilidad.
- El servidor limita los segundos aceptados por pulso y evita que varias pestañas sumen libremente el mismo intervalo.
- Las escrituras exitosas registran usuario, fecha, método, ruta y una descripción legible.
- La vista Developer permite filtrar por usuario y consultar accesos, tiempo de hoy, tiempo acumulado, última actividad y cambios.
- El historial comienza con v1.2.1; no se reconstruyen accesos ni acciones anteriores que nunca fueron registrados.
- No se guardan contraseñas, tokens, cuerpos de formularios ni contenido de notas dentro de esta auditoría.

## Mapa operativo

La política de seguridad impedía cargar las imágenes de fondo de Leaflet. La CSP ahora autoriza exclusivamente `https://*.tile.openstreetmap.org`, que es la fuente ya declarada por los dos mapas. Scripts, conexiones y el resto de las imágenes externas continúan bloqueados.

## Persistencia

La migración amplía la restricción del rol en `users` y agrega:

- `user_access_events`;
- `user_activity_daily`;
- `user_activity_heartbeats`;
- `user_change_log`.

Los usuarios, sesiones, vistas y preferencias existentes se conservan. La migración se valida con `PRAGMA foreign_key_check`.

## Verificación

```bash
pnpm test
pnpm run build
```
