# v0.8.4 — Resumen inicial “¿Cómo estamos?”

## Objetivo

Dar a la oficina una lectura inicial compacta de la situación sin obligarla a recorrer ocho reportes y sin crear una métrica general que mezcle universos incompatibles.

## Bloques

El Centro de reportes incorpora una portada con:

- venta neta, kilos y clientes compradores de `Ventas · Comercial`;
- variación contra el período anterior equivalente;
- avance del bloque `Objetivos kilos` contra el plan mensual activo;
- cuentas sin compra neta positiva en 30 días;
- saldo pendiente documental y saldo vencido;
- cinco vendedores con mayor diferencia absoluta de venta neta contra el período equivalente;
- alertas relevantes de la bandeja de Inventario;
- facturas sin foja, en foja abierta y en foja cerrada.

Cada bloque declara definición, período, corte, fuente, universo, advertencias y destino. Hacer clic abre el reporte o módulo responsable del dato.

## Contratos preservados

- Ventas, kilos, compradores y variaciones usan el universo y los cortes ya resueltos por `Ventas · Comercial`.
- La variación por vendedor utiliza esos mismos movimientos y períodos. El orden responde a la diferencia absoluta en pesos; el porcentaje no se calcula cuando la base anterior es cero.
- Objetivos mantiene separados los resultados GESI y el plan versionado de Salice.
- Cuentas no compradoras conserva sus ventanas de 180/90/30 días y su universo exclusivo de clientes activos.
- Saldos conserva la cartera documental; no se reemplaza por el saldo neto de cuenta corriente.
- Inventario usa la misma política, candidatos, excepciones y revisiones que la bandeja operativa.
- Fojas usa los estados normalizados del snapshot. `Foja cerrada` documenta el cierre de la carga en GESI y no confirma entrega.

Los bloques no se suman, no se ponderan y no forman un semáforo general.

## Implementación

- `GET /api/reports/executive-summary` compone los contratos existentes y devuelve metadatos propios por bloque.
- `server/executive-summary.ts` centraliza la composición sin copiar fórmulas.
- `buildCommercialSellerVariations` agrega sólo el desglose liviano necesario para comparar vendedores con el corte ya resuelto.
- `src/components/ExecutiveSummary.tsx` presenta el resumen y su navegación.
- El catálogo de métricas registra este nuevo consumidor y explicita las métricas de alertas de inventario y estados de foja.

## Límites

- No se modifica ningún reporte fuente ni sus cifras conciliadas.
- No se interpreta una variación como cumplimiento de objetivo.
- No se infiere entrega, reposición, compra, comunicación o gestión humana.
- No se agrega exportación de la portada.
- No se modifica el tutorial.
