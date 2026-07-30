# Salice Inteligente v1.3.0

## Objetivo

La v1.3.0 amplía la asistencia con IA sin convertirla en fuente de cifras ni superar el presupuesto diario acordado. Los reportes, indicadores y universos determinísticos continúan siendo la fuente de verdad.

## Corrección de continuidad

La actualización de las 03:00 del 30 de julio aprobó y publicó correctamente el paquete de datos, pero el enriquecimiento se detuvo porque `product_vectorization:v1` ya estaba registrado con otro modelo. Las versiones de prompt son inmutables: cualquier cambio de modelo, razonamiento, prompt o esquema requiere una versión nueva.

Esta versión:

- asigna una versión nueva a cada configuración modificada;
- aísla los conflictos de registro por función para que una incompatibilidad no detenga las demás lecturas;
- conserva el paquete determinístico y los artefactos válidos anteriores ante cualquier falla de IA;
- registra el resultado parcial y la causa de la función afectada.

## Robustez de la actualización GESI

La actualización manual del 30 de julio también expuso dos respuestas transitorias o técnicas de GESI que ahora se tratan explícitamente:

- las consultas de precios y los demás endpoints generales reintentan errores HTTP 500 transitorios; se conserva el tratamiento especial de `GetItem`, que divide lotes rechazados;
- las existencias globales con empresa técnica `65535` sólo se normalizan a empresa 3 cuando pertenecen a sucursal 3, depósito 2 y tienen ambas cantidades de stock exactamente en cero.

Cualquier existencia con otra empresa, sucursal o depósito, o un registro global con stock distinto de cero, continúa bloqueando el paquete candidato. La normalización queda registrada como advertencia auditable y nunca amplía el universo comercial fuera de empresa y sucursal 3.

## Modelos y razonamiento

- Clasificación de productos: GPT-5.6 Terra, razonamiento medio.
- Narrativas de reportes: GPT-5.6 Terra, razonamiento bajo.
- Resumen ejecutivo: GPT-5.6 Sol, razonamiento bajo.
- Explicaciones de Bandeja comercial: GPT-5.6 Luna, razonamiento bajo.
- Resúmenes de vendedores: GPT-5.6 Luna, razonamiento bajo.
- Lectura agregada de Bandeja y demanda de productos: GPT-5.6 Terra, razonamiento bajo.

El resumen ejecutivo reserva el modelo de mayor capacidad para una única síntesis de alto valor. Las tareas repetitivas y estructuradas conservan modelos de menor costo. Todas usan salida estructurada, validación semántica, control de evidencia y reutilización incremental.

## Nuevas lecturas

### Bandeja comercial

Una tarjeta plegada resume la semana operativa usando únicamente conteos y señales ya calculadas: clientes para revisar, compromisos, notas, bloqueos, riesgo, oportunidad y prioridad. No identifica personas, no interpreta el contenido de las notas y no crea tareas.

### Demanda y rotación

Una tarjeta plegada interpreta las ventanas equivalentes de 90 días, unidades, kilos estimados, compradores, aceleraciones y caídas. No pronostica demanda ni recomienda compras. La cobertura parcial de kilos o historia se conserva como limitación.

Ambas lecturas se generan durante la actualización de datos y se reutilizan cuando su evidencia no cambia. Entrar a una pantalla no llama a OpenAI.

## Presupuesto

`SALICE_AI_DAILY_BUDGET_USD` limita a USD 1 el gasto total compartido por todas las ejecuciones del día de Argentina. `SALICE_AI_MAX_COST_USD_PER_RUN` permanece como una protección secundaria por ejecución y el presupuesto mensual continúa en USD 30 con alerta al 80%.

Configuración muestra consumo y saldo del día, además del seguimiento mensual.

## Verificación

```bash
pnpm test
pnpm run build
```
