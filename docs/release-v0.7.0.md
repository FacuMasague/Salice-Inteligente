# Salice Inteligente v0.7.0 — Rutas de reparto simples

## Objetivo

Esta versión acota la primera entrega logística a una necesidad concreta de la oficina: mejorar `Rutas`, leer las facturas que podrían requerir reparto y aprovechar las fojas que GESI realmente expone. No crea un sistema de despacho, una aplicación para fleteros ni una prueba de entrega.

También cierra una deuda pequeña de v0.6: las notas humanas agregadas a recomendaciones de productos ahora pueden eliminarse sin borrar la recomendación ni una lista guardada.

## Fuente y alcance

- Fuente operativa: API de GESI, empresa 3 y sucursal 3.
- Centro de distribución: Eduardo Bradley 1450, Mar del Plata.
- Cobertura logística predeterminada: últimos 45 días desde la captura.
- Captura real validada: 23/07/2026 a las 14:26 de Argentina.
- Fojas observadas: 74; 73 cerradas y una abierta.
- Facturas logísticas normalizadas: 3.068.
- Facturas sin foja: 2.488.
- Facturas en fojas cerradas: 580.
- Facturas en fojas abiertas: ninguna en el corte actual; la única foja abierta estaba vacía.

GESI rechazó el endpoint específico consultado para comprobantes no asignados. Por eso la captura obtiene todas las fojas y sus detalles y deriva `sin foja` como la diferencia entre las facturas recientes y las asignaciones observadas. La advertencia queda registrada en la captura; no se inventa un estado.

## Estados que muestra la aplicación

- `Sin asignar a foja`: la factura reciente no aparece en ninguna de las fojas capturadas.
- `Foja abierta`: la factura aparece en una foja cuyo estado GESI está abierto.
- `Foja cerrada`: la factura aparece en una foja cerrada por GESI.
- `Estado desconocido`: la fuente no permite clasificar de forma segura.

Una foja cerrada no equivale a entrega realizada. No existe todavía evidencia confiable de recepción, incidencia, GPS o recorrido real y la interfaz lo aclara de forma permanente.

La misma lectura aparece en `Cliente → Cuenta corriente → Historial de cuenta`. Cada factura muestra su foja y estado cuando existe una asociación observada; las anteriores al inicio de cobertura se rotulan `Fuera de cobertura de fojas` en vez de inferirse como no asignadas.

## Rutas de reparto

- Los filtros trabajan por fecha de factura, estado logístico, localidad y búsqueda.
- Varias facturas del mismo cliente se agrupan en una parada.
- La dirección y los problemas de geocodificación permanecen visibles.
- Una parada sin coordenadas no entra en el cálculo, pero tampoco desaparece de la lista.
- El usuario decide las paradas y puede ordenarlas manualmente.
- `Estimar orden actual` respeta esa secuencia.
- `Sugerir secuencia` usa cercanía geográfica de forma explicable.
- Todo recorrido parte y termina en Salice.
- Distancia y tiempo son estimaciones; no representan tránsito, capacidad, disponibilidad, ventanas horarias ni un viaje realizado.
- La navegación externa es opcional y no registra actividad.

La fecha sugerida usa la práctica general informada por la oficina: día siguiente a la factura y lunes para una factura emitida el viernes. Se presenta como referencia y no planifica, asigna ni confirma un envío.

## Notas de recomendaciones

`Cliente → Gestiones → Oportunidades` permite eliminar una nota humana vinculada a productos. La operación:

- exige confirmación;
- elimina la actividad humana;
- elimina un vínculo creado sólo para esa nota;
- conserva un vínculo perteneciente a una lista guardada y deja su `activity_id` vacío;
- no modifica productos, recomendaciones, facturas ni datos GESI.

## Contratos principales

- `shared/models.ts`: `LogisticsSnapshot`, `DeliveryInvoice`, `DeliverySheet` y estados de asignación.
- `shared/algorithms.ts`: agrupación por cliente y optimización manual o sugerida.
- `server/gesi/normalize.ts`: asociación de facturas, fojas y fecha sugerida.
- `scripts/capture-gesi.ts`: captura completa de fojas y fallback auditable para no asignados.
- `src/views/RoutesView.tsx`: superficie de reparto.
- `server/operational-store.ts`: borrado transaccional de notas de oportunidades.

## Fuera de alcance

- Estados locales de entrega o incidencias.
- Planificación persistente de viajes.
- Asignación de vehículos o fleteros.
- Capacidad y disponibilidad.
- Mensajes o comunicaciones.
- GPS, telemetría o prueba de entrega.
- Experiencia móvil.
- Actualización automática o despliegue web.

Esos temas sólo se incorporarán si una necesidad real de Salice justifica la complejidad.
