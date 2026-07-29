# Salice Inteligente v1.2.0

## Acceso privado

- Toda ruta de datos, reportes, exportaciones y operaciones exige una sesión activa.
- `/api/health` permanece público para Render, pero sólo informa disponibilidad y versión.
- Registro, inicio de sesión y estado de sesión son las únicas rutas públicas de autenticación.
- Las cuentas nuevas nacen como Oficina pendiente y no acceden hasta ser aprobadas.
- Los administradores pueden aprobar, rechazar, habilitar, deshabilitar y asignar roles.
- El último administrador activo no puede deshabilitarse ni degradarse.
- Deshabilitar una cuenta revoca todas sus sesiones.

## Protección técnica

- Las contraseñas se derivan con `scrypt`, sal individual y comparación en tiempo constante.
- Los tokens de sesión y CSRF se generan aleatoriamente y se guardan sólo como hash.
- La sesión usa cookie `HttpOnly`, `Secure` en producción, `SameSite=Strict` y vencimiento de 30 días.
- Toda escritura autenticada exige un token CSRF asociado a la sesión.
- Las solicitudes con origen ajeno se rechazan.
- Se aplican límites a intentos de ingreso y solicitudes de registro.
- La API privada responde con caché deshabilitada y encabezados de seguridad.
- El HTML y los recursos del acceso pueden cargarse sin sesión, pero no contienen datos del negocio.

## Usuarios y trazabilidad

- **Sistema → Usuarios** está disponible únicamente para Administradores.
- El menú de usuario se encuentra junto a Notificaciones y permite cerrar sesión.
- Vistas guardadas, favoritos y reportes recientes quedan asociados al usuario.
- Notas comerciales, notas de oportunidades, seguimiento de cobranzas, correcciones, feedback de IA y cambios de objetivos toman el nombre de la sesión autenticada.
- Las notas comerciales muestran quién las registró. Los registros anteriores permanecen identificados como tales.

## Asistencia con IA

- Reportes y resumen ejecutivo conservan GPT-5.6 Terra.
- Clasificación de productos, explicaciones de Bandeja y resúmenes por vendedor usan GPT-5.6 Luna.
- Cada intento calcula su costo con la tarifa del modelo realmente utilizado.
- Las salidas visibles aplican separador de miles a valores absolutos y hasta dos decimales a porcentajes.
- La explicación vigente de Bandeja también puede consultarse desde la ficha del cliente, sin ejecutar IA al abrirla.
- Los reportes determinísticos, controles de evidencia, incrementalidad y presupuesto continúan siendo la fuente de verdad.

La selección por roles sigue la guía oficial de modelos: [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) equilibra inteligencia y costo, mientras [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) está orientado a cargas sensibles al costo y de mayor volumen.

## Despliegue

Antes de publicar deben configurarse en Render, como secretos:

- `SALICE_INITIAL_ADMIN_USERNAME`;
- `SALICE_INITIAL_ADMIN_PASSWORD`;
- `SALICE_INITIAL_ADMIN_NAME`.

No existe un usuario ni una contraseña predeterminados. Si no hay un administrador activo y esas variables no están configuradas, la información permanece bloqueada.

## Compatibilidad

- Las tablas de usuarios, sesiones y preferencias se agregan a `operations.sqlite`.
- Las vistas existentes se asignan al administrador inicial cuando todavía no tienen propietario.
- Las actividades y notas anteriores siguen siendo legibles; su autor se presenta como registro anterior cuando no existía trazabilidad.
- La revisión del snapshot comercial no cambia.

## Verificación mínima

```bash
pnpm test
pnpm run build
```

La prueba de integración de autenticación inicia un servidor aislado y comprueba acceso anónimo, sesión aprobada, CSRF, roles, aprobación y revocación.
