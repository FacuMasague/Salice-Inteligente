# Priorización comercial y vencimientos · v0.4.4

## Clientes con variaciones relevantes

`Mayor crecimiento` y `Mayor caída` aplican además del orden un universo mínimo de `+30%` y `-30%`, respectivamente. La comparación continúa siendo últimos 90 días contra los 90 inmediatamente anteriores.

La marca de revisión vive en `operations.sqlite`, separada del snapshot GESI, con clave por cliente y dirección de la variación. Los no revisados se ordenan primero. La marca puede quitarse y sobrevive a reinicios y actualizaciones de datos; si un cliente cambia de dirección, la revisión anterior no lo oculta en la nueva lista.

## Cartera

La ventana Cartera usa únicamente clientes activos en GESI. Esta decisión no elimina documentos ni modifica el tablero administrativo de Cuentas por cobrar, cuyo universo puede conservar deuda histórica para seguimiento.

La clasificación temporal se calcula contra la fecha del snapshot:

- por vencer: hoy–7, 8–30, 31–60 y más de 60 días;
- vencida: 1–7, 8–30, 31–90 y más de 90 días.

Las bandas por vencer usan verde. Las bandas vencidas conservan la progresión ocre–rojo. El filtro usa la regla OR dentro de la dimensión, por lo que permite combinar cualquier cantidad de bandas.

## Promesas e historial

Una promesa activa del seguimiento administrativo se sincroniza con `payment_promises` mediante una clave estable por cliente. De esta forma aparece en `Promesas de pago`, notificaciones y consultas operativas sin convertirse en una cobranza GESI.

Los guardados nuevos generan un único evento de seguimiento con el estado completo. Los eventos atómicos de versiones anteriores se conservan en la base, pero `Estado actualizado` no se presenta en la interfaz. Al borrar una acción se marcan juntos sus eventos históricos y se reconstruye `receivable_cases` a partir del último estado no eliminado. La promesa materializada se actualiza o retira con la misma operación.

## Convención numérica

Los campos editables aceptan números argentinos como `125.000,50`. Internamente se guardan como números y las respuestas visuales se forman con locale `es-AR`: punto de miles y coma decimal. Las APIs mantienen compatibilidad con valores JSON numéricos y decimales técnicos con punto.

## Verificación realizada

- compilación TypeScript y Vite correcta;
- 10 pruebas específicas aprobadas sobre persistencia, reversión, promesas, tablero de cobranza y números localizados;
- auditoría de datos sin problemas y `integrity_check` de operaciones correcto;
- auditoría de plataforma sin fallas requeridas: 19 controles aprobados y 4 advertencias documentadas de cobertura GESI;
- revisión visual de Clientes, Cartera y Cuentas por cobrar: umbral y revisión comercial, exclusión de 6 facturas abiertas pertenecientes a clientes inactivos, combinación de bandas temporales, promesa incompleta visible y ausencia de errores en la consola;
- comprobación real de arranque: un seguimiento cuyos eventos habían sido eliminados volvió a `Sin gestionar` y dejó de proyectarse como pago prometido.

La suite completa ejecutó 105 pruebas: 86 aprobaron y 19 fallaron en siete archivos históricos de reportes. Esos casos conservan cifras y fechas testigo del snapshot del 20/07/2026, mientras el paquete activo corresponde al 21/07/2026. No se modificaron resultados GESI ni se ajustaron cifras para hacer coincidir esas referencias; los fixtures deben versionarse junto con su snapshot de origen.
