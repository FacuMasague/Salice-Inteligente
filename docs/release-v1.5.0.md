# Salice Inteligente v1.5.0

## Objetivo

La v1.5.0 mejora exclusivamente las herramientas del rol Developer para supervisar adopción, acciones y salud técnica. Oficina y Administrador no reciben nuevas pantallas ni acceso a estos endpoints.

## Actividad y adopción

- El tiempo activo se desglosa por sección del programa y usuario.
- Se registran visitas, días activos, sección principal y último uso.
- La vista permite comparar 7, 30, 90 y 365 días o consultar todo el historial.
- Continúa vigente el anti-AFK de cinco minutos y sólo se suma tiempo con la pestaña visible.
- Los cambios muestran contexto estructurado útil, limitado a identificadores, estados, meses, nombres y campos permitidos.
- Nunca se copian contraseñas, tokens, textos de notas ni contenido libre de formularios al registro de actividad.

Los datos anteriores a v1.5.0 conservan su tiempo activo total, accesos y cambios. El detalle por sección comienza a acumularse desde esta versión y no se reconstruye artificialmente.

## Alertas técnicas

- Una actualización fallida genera una alerta sin reemplazar el paquete determinístico anterior.
- Una ejecución de IA parcial o fallida genera una alerta sin invalidar los datos aprobados.
- También se registran fallas del proceso de actualización, recuperaciones de ejecuciones interrumpidas y errores no controlados de la API o del proceso Node.js.
- Eventos idénticos se deduplican durante seis horas para evitar correos repetidos.
- El historial indica si el correo fue enviado, deduplicado, falló o todavía no está configurado.
- Developer puede enviar un correo de prueba desde la pantalla para validar la configuración sin provocar una falla real.

El envío usa SMTP con STARTTLS. El usuario, remitente y destinatario predeterminados son `facumasague@gmail.com`; sólo la contraseña de aplicación se guarda como secreto en Render. Una falla del correo nunca detiene una actualización, una respuesta determinística ni el servidor.

## Persistencia y permisos

La actividad por sección y las alertas se guardan en `operations.sqlite`, dentro del disco persistente existente. Las consultas de actividad y alertas exigen el rol Developer en el servidor; ocultar la navegación no es el único control de acceso.
