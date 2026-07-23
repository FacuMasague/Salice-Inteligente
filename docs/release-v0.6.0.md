# Salice Inteligente v0.6.0 · Bandeja comercial semanal

## Objetivo

Reunir señales, oportunidades, promesas, recordatorios y notas existentes en una superficie liviana para la oficina. La bandeja orienta una revisión y conserva contexto; no implementa comunicaciones, asignaciones, aprobaciones ni una planificación comercial obligatoria.

## Fuentes y separación

| Contenido | Fuente | Significado |
|---|---|---|
| C, O, P, caída, bloqueo y revisión sugerida | Snapshot GESI y reglas compartidas | Señal calculada; no demuestra trabajo humano |
| Oportunidades de producto | Snapshot, inventario y motor explicable v0.5.8 | Evidencia para conversar; no es probabilidad de compra |
| Promesas | Proyección local de Cuentas por cobrar | Compromiso informado; no es cobranza conciliada |
| Seguimientos | `receivable_cases` | Recordatorio existente administrado en Cuentas por cobrar |
| Recordatorios anteriores | `agenda_items` | Información histórica legible; no se crean nuevas tareas |
| Notas de oficina | `commercial_activities` con resultado `noted` | Descripción humana de algo ocurrido fuera del sistema |

Una actualización de GESI puede cambiar las señales, pero nunca borra las notas locales. Una nota tampoco modifica las señales.

## Semana y universo

- La semana va de lunes a domingo en fecha operativa argentina.
- Participan clientes activos de GESI que coinciden con el filtro de vendedor.
- Promesas, seguimientos, recordatorios y notas locales no reincorporan clientes inactivos.
- El sistema propone una base acotada de 24 clientes para un vendedor o 36 para la lectura conjunta. Reserva inicialmente la mitad para cobranzas accionables y completa el resto con oportunidades elegibles; si una mitad no alcanza, la otra ocupa los lugares disponibles.
- Promesas, seguimientos, recordatorios y clientes con notas de la semana se incorporan aunque no estén en esa base.
- Un cliente aparece una sola vez y reúne todos sus motivos.
- Promesas y recordatorios anteriores al inicio de la semana continúan visibles como vencidos.

## Orden

No se agregó una métrica:

1. promesas vencidas;
2. recordatorios o seguimientos vencidos;
3. promesas de la semana;
4. clientes comercialmente elegibles;
5. bloqueos de venta informados por GESI;
6. prioridad P;
7. nombre del cliente.

C, O y P conservan sus definiciones y escalas independientes.

O sólo se presenta como oportunidad operativa cuando el cliente está activo, no tiene bloqueo de ventas y registra compras positivas en los últimos 90 días. Un cliente que no cumple esa condición puede seguir apareciendo por cobranza, recordatorios o notas, sin señal O ni productos sugeridos. La misma exclusión se aplica en Productos → Oportunidades y en la lectura inversa de clientes sugeridos desde una ficha de producto.

## Notas de oficina

`POST /api/commercial-notes` requiere:

- cliente activo;
- categoría `Nota general`, `Visita realizada`, `Llamada realizada` u `Oferta conversada`;
- fecha y hora no futura;
- texto obligatorio.

El endpoint guarda una nota con resultado técnico `noted`. No acepta próxima acción, importe, productos ofrecidos, promesa ni identificador de tarea. La persistencia fuerza esos campos a valores vacíos y nunca crea una fila en `agenda_items`.

La aplicación dejó de exponer creación de tareas mediante `POST /api/agenda` y dejó de exponer el registro anterior de gestiones mediante `POST /api/activities`. Las tablas y recordatorios históricos se preservan.

## Interfaz y navegación

- `Administración → Bandeja comercial` permite cambiar de semana y filtrar por vendedor, origen o texto.
- Los indicadores cuentan clientes únicos, señales del sistema, compromisos/recordatorios y notas de la semana.
- Los indicadores centran icono y contenido; la página permite desplazar los controles superiores para dedicar la altura de la ventana a la lectura operativa.
- El detalle separa motivos, oportunidades y notas.
- La oportunidad se calcula al abrir el cliente para no recalcular todo el catálogo en cada carga.
- Cliente, vendedor y producto conservan navegación contextual.
- Promesas y seguimientos abren Cuentas por cobrar; clientes con coordenadas pueden abrirse en Rutas.
- En Clientes y en la ficha se usa `Revisión sugerida`, no `Visita sugerida` ni `Próxima acción`.

## Contratos y pruebas

- `server/agenda.ts`: semana, fuentes, deduplicación y precedencias.
- `shared/models.ts`: contrato `CommercialInboxPayload`.
- `server/operational-store.ts`: creación acotada de notas.
- `server/agenda.test.ts`: semana, combinación de fuentes, deduplicación, independencia de notas y residuales.
- `server/agenda.test.ts`: también prueba que bloqueados y cuentas sin compra no reciban oportunidad, y que ningún dato local reincorpore clientes inactivos.
- `server/operational-admin.test.ts`: una nota no crea tareas, promesas ni próximas acciones.

## Limitaciones

- La fecha de revisión se calcula desde el snapshot y puede perder actualidad si GESI no se actualiza.
- Una nota describe lo que una persona afirma que ocurrió; no es una integración con teléfono, correo, ubicación o ventas.
- La bandeja no modifica promesas ni estados de cobranza.
- Los recordatorios históricos no se migran ni se eliminan.
- No se agregó autenticación, experiencia móvil, hosting ni actualización nocturna.
- El tutorial permanece sin cambios por decisión expresa.

## Validación

- Suite completa: 173 pruebas aprobadas, 7 conciliaciones históricas omitidas explícitamente y 0 fallas.
- Build de producción y comprobación TypeScript: correctos.
- Auditoría de datos: 0 problemas.
- Integridad de operaciones: correcta sobre 19 tablas.
- Auditoría de plataforma: 23 controles aprobados, 0 fallas obligatorias y 5 advertencias conocidas de cobertura/calidad de GESI.
- Auditorías SPT, vectores y precios: aprobadas.
- Revisión visual de escritorio y quiebres responsive: correcta, sin desbordamiento horizontal propio de la bandeja.
- Verificación sobre el snapshot activo: 36 clientes visibles, 18 lugares iniciales de cobranza y 18 cuentas comercialmente elegibles; 0 clientes inactivos y 0 señales O en bloqueados o cuentas sin ventas de 90 días.
- Alta de una nota verificada sobre una copia temporal de `operations.sqlite`: apareció en el cliente y en el indicador semanal sin crear tareas ni alterar la persistencia real.
- Consola del navegador: 0 errores.
