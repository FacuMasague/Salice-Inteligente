# Despliegue de Salice Inteligente en Render · v0.11

## Arquitectura elegida

La producción usa un único Web Service pago de Render con:

- Node.js 24 y `pnpm`;
- una sola instancia `standard` de 2 GB;
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
También fija el inicio del histórico comercial SPT en `2025-01-01`: la auditoría requiere los doce meses de 2025 y una instalación nueva no puede depender de un archivo histórico preexistente.

## Capacidad y costo

La captura real usada para validar v0.11 pesa aproximadamente 449 MB. El flujo inicial materializaba el archivo completo: la normalización alcanzaba 1,62 GB de memoria residente y la construcción comercial 1,50 GB.

El despliegue Standard usa un flujo de memoria acotada. La captura descarga los recursos de forma secuencial y escribe el JSON progresivamente. La normalización omite el histórico SPT, que no consume, y la base comercial relee el archivo por secciones y vuelca cada comprobante directamente a SQLite. En la medición local de la misma captura, la normalización bajó a 1,15 GB y la construcción comercial a 0,36 GB; esta última pasó de unos 5 segundos a unos 145 segundos. Los procesos hijos tienen límites de heap separados para priorizar estabilidad sobre velocidad.

Por eso el Blueprint usa `standard` (2 GB, 1 CPU). Antes de considerar el despliegue cerrado se debe ejecutar una actualización completa en Render y revisar la métrica de memoria de las etapas, especialmente la captura GESI.

## Primer arranque

Un disco nuevo no contiene datos. Para que la URL y el health check estén disponibles durante la carga inicial, el servidor abre primero el snapshot demostrativo y dispara automáticamente una actualización `bootstrap`.

La primera captura descarga el histórico comercial completo desde enero de 2025, por lo que puede tardar más que una actualización ordinaria y utilizar bastante disco o memoria. En los logs debe aparecer:

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
