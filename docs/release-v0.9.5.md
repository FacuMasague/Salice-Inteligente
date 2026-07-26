# v0.9.5 — Control global de calidad, utilidad y costo

## Cierre de la fase experimental

La versión incorpora una auditoría determinística posterior a cada salida de IA. Verifica citas, cifras, universos, períodos parciales, comparaciones equivalentes y contradicciones entre narrativas que usan la misma evidencia. Los controles tienen versión propia y quedan guardados de forma append-only.

Una salida bloqueada deja de ser elegible para las pantallas y para reutilización. El reporte, resumen o bandeja determinísticos continúan disponibles: la calidad de IA nunca condiciona la aprobación del paquete de datos.

Los artefactos válidos creados antes de este control se revisan localmente al iniciar la versión, sin volver a llamar al proveedor.

## Feedback humano

Cada lectura ampliada permite marcarla como útil, poco útil, incorrecta o incompleta. Los dos últimos estados requieren una corrección breve.

Cada envío crea un evento inmutable con artefacto, snapshot, versión de prompt, sujeto evaluado, actor y versión correlativa de la corrección. Las correcciones no modifican automáticamente prompts, resultados ni reglas.

No se incorpora aprendizaje autónomo, ajuste automático de prompts ni fine-tuning automático.

## Consumo y presupuesto

`Configuración` muestra consumo del mes e histórico, tokens, costo, reintentos y resultados nuevos, reutilizados, omitidos y fallidos. También desglosa el mes por función y las últimas actualizaciones.

El límite recomendado y predeterminado continúa siendo USD 1 por actualización. El presupuesto mensual es configurable con `SALICE_AI_MONTHLY_BUDGET_USD` y la alerta porcentual con `SALICE_AI_MONTHLY_BUDGET_WARNING_PERCENT`.

Las ejecuciones huérfanas se recuperan al iniciar el sistema para que no permanezcan indefinidamente como “en curso”. Una actualización reutilizada puede costar cero sin ocultar el gasto histórico real.

## Presentación de IA

Todas las lecturas asistidas aparecen cerradas inicialmente. El encabezado conserva una síntesis, la vigencia y la cantidad de datos citados; al abrirlo muestra hallazgos, señales, advertencias, preguntas y trazabilidad.

En Bandeja comercial, la tarjeta usa los mismos márgenes y ancho que “Motivos visibles”. No puede crecer fuera del panel ni comprimirse hasta desaparecer dentro de la columna desplazable.

Todas las tarjetas de IA mantienen separación vertical respecto de los indicadores y paneles contiguos. Bandeja comercial conserva además el mismo margen lateral a ambos lados.

Las referencias técnicas incorporadas accidentalmente por el modelo se ocultan en la presentación. Los identificadores originales siguen preservados en el artefacto y en los datos de respaldo.

Las cifras generadas se normalizan tanto en la instrucción del modelo como en la presentación: los porcentajes usan dos decimales y los valores absolutos se redondean a enteros. La capa visual también corrige los artefactos creados antes de esta regla.

## “¿Cómo estamos?”

El resumen determinístico se construye durante `refresh:gesi` y se incorpora al manifiesto como `executive-summary.json`. `/api/dashboard` lo entrega con el resto de la foto activa, por lo que entrar a Reportes no inicia un cálculo ni cambia el orden de la página.

La sección completa también es plegable. Cerrada muestra la lectura general de IA; abierta presenta la lectura IA completa y los seis bloques de indicadores. La lectura IA interna se renderiza directamente, sin un segundo menú plegable.

## Compatibilidad

Los paquetes anteriores que todavía no incluyen el nuevo artefacto se calculan una vez durante la carga inicial del dashboard. Todos los paquetes creados por v0.9.5 lo guardan y verifican mediante SHA-256.
