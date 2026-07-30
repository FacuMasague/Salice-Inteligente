# Despliegue de Salice Inteligente en Render · v1.2

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
   - `OPENAI_API_KEY`;
   - `SALICE_INITIAL_ADMIN_USERNAME`;
   - `SALICE_INITIAL_ADMIN_PASSWORD`.
5. Aplicar el Blueprint y esperar a que el Web Service quede `Live`.

El Blueprint define build, start, plan, región, disco, health check, horarios, zona horaria, rol inicial Developer y presupuestos de IA. Las credenciales no se guardan en Git. La contraseña inicial debe tener al menos 8 caracteres y combinar letras y números.
También fija el inicio del histórico comercial SPT de bootstrap en `2025-01-01`: la auditoría requiere los doce meses de 2025 y una instalación nueva no puede depender de un archivo histórico preexistente. Una vez creada la captura persistente, las actualizaciones ordinarias descargan sólo la ventana móvil y conservan el histórico anterior.

## Capacidad y costo

La captura real usada para validar v0.11 pesa aproximadamente 449 MB. El flujo inicial materializaba el archivo completo: la normalización alcanzaba 1,62 GB de memoria residente y la construcción comercial 1,50 GB.

El despliegue Standard usa un flujo de memoria acotada. La captura descarga los recursos de forma secuencial y escribe el JSON progresivamente. La normalización omite el histórico SPT, que no consume, y la base comercial relee el archivo por secciones y vuelca cada comprobante directamente a SQLite. En la medición local de la captura del 29 de julio, la normalización necesitó un heap de 1.024 MB; con 512 y 768 MB se agotó antes de escribir el candidato. La construcción comercial conserva el límite general de 512 MB. Los procesos hijos tienen límites separados y se ejecutan de forma secuencial para priorizar estabilidad.

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

1. `/api/health` responde `200` y no incluye fuente, fecha ni cifras;
2. `/api/dashboard`, reportes y exportaciones responden `401` sin cookie de sesión;
3. el administrador inicial puede ingresar y **Sistema → Usuarios** sólo está disponible para su rol;
4. una cuenta nueva permanece pendiente hasta que el administrador la aprueba;
5. una cuenta deshabilitada pierde acceso inmediatamente;
6. `/api/system/data-health` informa `schedule.enabled: true`, zona `America/Argentina/Buenos_Aires`, horarios `03:00` y `15:00`, y una próxima ejecución después de iniciar sesión;
7. la pantalla principal y los reportes cargan el último snapshot;
8. Configuración muestra historial, consumo de IA y última actualización;
9. una actualización sin cambios registra resultados reutilizados y no nuevas llamadas;
10. un reporte modificado, un vendedor modificado o un cliente nuevo genera solamente su trabajo de IA correspondiente.

## Operación

- Render conserva sólo lo que se encuentra bajo el punto de montaje `data/`.
- El despliegue de un servicio con disco puede tener una breve interrupción; al volver, el programador revisa si quedó un horario pendiente.
- No aumentar la cantidad de instancias: el disco y las bases SQLite son deliberadamente de instancia única.
- Conservar el health check y revisar alertas de frescura, presupuesto mensual y espacio del disco.
- Una falla de GESI o de IA no reemplaza el último paquete determinístico aprobado.
- La restauración de `operations.sqlite` sigue siendo manual y administrada.
- No eliminar ni reemplazar las variables del administrador inicial hasta confirmar que existe al menos otro administrador activo.
- No publicar credenciales en logs, capturas, documentación ni respuestas.

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
