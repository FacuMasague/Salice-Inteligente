# v0.9.4 — Bandeja comercial y vendedores

## Bandeja comercial

El algoritmo determinístico continúa seleccionando hasta 36 clientes por semana. La IA recibe lotes de hasta seis y sólo explica esas entidades.

La evidencia incluye:

- C, O y P como métricas separadas;
- ventas, variación y saldo vencido;
- bloqueos y pertenencia de cartera;
- señales determinísticas;
- conteo, categoría y fecha de notas, sin enviar su texto;
- oportunidades ya calculadas y elegibles.

La salida debe contener exactamente los mismos clientes del lote. Para un cliente bloqueado o sin compras positivas en 90 días, cualquier oportunidad generada vuelve inválido el lote.

No se generan mensajes, guiones, tareas, gestiones ni afirmaciones de que un producto fue ofrecido.

## Vendedores

Los resúmenes usan únicamente vendedores o responsables presentes entre clientes activos. Reciben agregados de cartera, ventas, cobranza, oportunidad elegible, prioridad y cobertura.

No reciben clientes individuales ni textos de notas. El contrato prohíbe evaluar productividad, crear rankings, asignar tareas o definir objetivos.

## Terra Low frente a Medium

La evaluación controlada sobre un lote real de seis clientes obtuvo:

| Esfuerzo | Contrato estructural | Contrato semántico | Costo |
|---|---|---|---:|
| Low | aprobado | aprobado | USD 0,01684375 |
| Medium | aprobado | rechazado: oportunidad para cliente no elegible | USD 0,025690625 |

Se conserva **Terra Low** para bandeja y vendedores. El resultado completo queda en `data/quality/ai-commercial-effort-evaluation.json`, fuera de Git.

## Cierre verificado

La ejecución real generó seis lotes de bandeja y dos lotes de vendedores sin fallos. La segunda ejecución reutilizó todos los artefactos con costo cero.

