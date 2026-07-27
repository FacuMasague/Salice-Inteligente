# Despliegue de Salice Inteligente en Render · v0.11

## Arquitectura elegida

La producción usa un único Web Service pago de Render con:

- Node.js 24 y `pnpm`;
- una sola instancia `pro` de 4 GB;
- disco persistente de 5 GB montado en `/opt/render/project/src/data`;
- health check en `/api/health`;
- programador interno a las 03:00 y 15:00 de Argentina.

No se crea un Cron Job separado. Render no permite adjuntar discos persistentes a Cron Jobs y el proceso necesita compartir snapshots, manifiesto activo, bases SQLite, feedback y artefactos de IA con la web. El disco también obliga a mantener una única instancia, que es el modelo correcto para el bloqueo de actualización y SQLite.

## Crear el servicio

1. Publicar la branch aprobada en el repositorio remoto y fusionarla a la rama que despliega producción.
2. En el panel de Render, elegir **New → Blueprint** y conectar el repositorio.
3. Seleccionar el archivo `render.yaml`.
4. Completar las variables marcadas como secretas:
   - `GESI_USERNAME`;
   - `GESI_PASSWORD`;
   - `OPENAI_API_KEY`.
5. Aplicar el Blueprint y esperar a que el Web Service quede `Live`.

El Blueprint define build, start, plan, región, disco, health check, horarios, zona horaria y presupuestos de IA. Las credenciales no se guardan en Git.

## Capacidad y costo

La captura real usada para validar v0.11 pesa aproximadamente 449 MB. La normalización alcanzó 1,62 GB de memoria residente y la construcción comercial 1,50 GB; la web activa ronda 0,51 GB. Ejecutar ambas dentro de los 2 GB del plan Standard no deja un margen seguro.

Por eso el Blueprint recomienda `pro` (4 GB, 2 CPU). A julio de 2026 Render publica aproximadamente USD 85/mes para Pro, frente a USD 25/mes para Standard, más el disco persistente. No conviene bajar el plan hasta reducir el uso de memoria de la captura o confirmar con métricas de producción que el proceso completo cabe sin reinicios.

## Primer arranque

Un disco nuevo no contiene datos. Para que la URL y el health check estén disponibles durante la carga inicial, el servidor abre primero el snapshot demostrativo y dispara automáticamente una actualización `bootstrap`.

La primera captura puede tardar y utilizar bastante disco o memoria. En los logs debe aparecer:

- el servidor escuchando en `0.0.0.0` y el puerto asignado por Render;
- la automatización habilitada;
- el inicio de la actualización inicial;
- la aprobación del paquete determinístico;
- el resultado completo, parcial, reutilizado u omitido de la IA.

No considerar terminada la publicación hasta que Configuración muestre una actualización exitosa de origen GESI.

## Verificación

Comprobar en la URL pública:

1. `/api/health` responde `200`;
2. `/api/system/data-health` informa `schedule.enabled: true`, zona `America/Argentina/Buenos_Aires`, horarios `03:00` y `15:00`, y una próxima ejecución;
3. la pantalla principal y los reportes cargan el último snapshot;
4. Configuración muestra historial, consumo de IA y última actualización;
5. una actualización sin cambios registra resultados reutilizados y no nuevas llamadas;
6. un reporte modificado, un vendedor modificado o un cliente nuevo genera solamente su trabajo de IA correspondiente.

## Operación

- Render conserva sólo lo que se encuentra bajo el punto de montaje `data/`.
- El despliegue de un servicio con disco puede tener una breve interrupción; al volver, el programador revisa si quedó un horario pendiente.
- No aumentar la cantidad de instancias: el disco y las bases SQLite son deliberadamente de instancia única.
- Conservar el health check y revisar alertas de frescura, presupuesto mensual y espacio del disco.
- Una falla de GESI o de IA no reemplaza el último paquete determinístico aprobado.
- La restauración de `operations.sqlite` sigue siendo manual y administrada.

Documentación oficial consultada:

- https://render.com/docs/blueprint-spec
- https://render.com/docs/disks
- https://render.com/docs/web-services
- https://render.com/docs/health-checks
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/node-version
- https://render.com/docs/cronjobs
- https://render.com/docs/compute-plans
- https://render.com/pricing
