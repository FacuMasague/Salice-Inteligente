# Salice Inteligente · v0.0.3

Prototipo web operativo y personalizado para Salice Distribuciones S.A. Permite explorar la cartera sobre un mapa, revisar ventas y cuenta corriente, comparar productos, generar recomendaciones explicables y planificar visitas por vendedor.

## Abrir el programa

Hacer doble clic en `run-salice.command`. Mientras la ventana de Terminal permanezca abierta, la aplicación queda disponible en:

`http://127.0.0.1:8787`

Para desarrollo, con Node.js 22+:

```bash
npm install
npm run dev
```

## Estado de los datos

La aplicación usa un **snapshot real de Salice**, capturado desde GESI el 16/07/2026. La importación queda fijada a `empresaID=3`, `sucursalID=3` y al depósito principal de Mar del Plata (`depositoID=2`). No mezcla las otras empresas visibles para el mismo usuario de GESI.

Cobertura del snapshot actual:

- 5.709 clientes conservados: 1.916 activos y 3.793 inactivos según el estado actual de GESI.
- 2.467 clientes con coordenadas válidas, de los cuales 879 están activos; el mapa abre en Mar del Plata y zona.
- 13.022 maestros de producto y 1.680 productos comercializables vectorizados.
- 29.060 facturas únicas de los últimos 365 días; 6.354 dentro de la ventana analítica de 90 días.
- 27.550 cobranzas y 26.804 pagos conciliados para calcular comportamiento de pago.
- 1.002 comprobantes con saldo abierto.
- 1.495 productos con precio de referencia disponible.

GESI devuelve error para el maestro de zonas y omitió el detalle de tres facturas. El sistema conserva las localidades disponibles y señala esta limitación en pantalla. El monto sin detalle representa una fracción mínima de la facturación y queda separado como venta no asignada.

El uso del estado activo/inactivo fue validado contra dos capturas consecutivas y la actividad comercial reciente. GESI incorporó un cliente activo nuevo y actualizó marcas del maestro entre ambas fotos; no se detectaron inactivos facturados después de su última actualización. La v0.0.3 mantiene el estado 1 como señal de actividad, pero separa una segunda dimensión: 1.360 activos tienen definición explícita para empresa 3 / sucursal 3 y 556 quedan marcados como “revisar pertenencia”. Estos últimos no se excluyen automáticamente hasta validar la regla con Salice.

## Qué incluye esta versión

- Tutorial interactivo de 11 pasos desde Configuración, con navegación automática, foco visual y progreso persistente en el equipo.
- Mapa Leaflet + OpenStreetMap con agrupación de marcadores y filtros por alcance, estado GESI, pertenencia Salice, zona y riesgo de cobranza.
- Ficha contextual del cliente sin perder la pantalla de origen: ventas, señales administrativas, C/O/P, compras, comprobantes, comportamiento contra vencimiento y notas persistentes.
- Agenda de cobranzas con filtros, bandas de antigüedad, saldo pendiente real, fechas con año y condición de pago; conserva deuda aunque el cliente esté inactivo.
- Catálogo vectorizado en 20 dimensiones, filtros por familia/disponibilidad, orden comercial, comparador, stock y precio de referencia GESI.
- Explorador explicable de los 20 vectores: descripción de cada regla y ranking completo del catálogo de afinidad 100 a 0.
- Recomendador explicable: ponderación por gasto, compatibilidad de especie, pares confirmados de Salice y confianza confiable/exploratoria/insuficiente.
- Puntajes separados: C para riesgo de cobranza, O para oportunidad comercial y P para prioridad combinada de visita.
- Planificador por vendedor y corredor, con duración por visita, jornada máxima, factor vial visible, alertas de factibilidad y enlaces de navegación.
- Búsqueda global de clientes/productos y bandeja de alertas de cobranza alta.
- Snapshot GESI de sólo lectura, respaldos automáticos y almacenamiento SQLite separado para notas y ejecuciones de sincronización.

La IA no interviene en la operación diaria de esta versión. La clasificación de productos se construye mediante reglas reproducibles sobre nombre, marca, familia y presentación. Una futura revisión periódica asistida por IA podrá ajustar esos vectores sin cambiar los algoritmos operativos.

## Capturar y activar una nueva foto manual

Las credenciales viven únicamente en `.env`, archivo ignorado por Git. `.env.example` contiene la configuración no sensible y nunca debe recibir la contraseña real.

```bash
npm run capture:gesi
npm run audit:gesi-capture
npm run sync:gesi
npm run audit:data
npm run audit:client-status
```

También se puede ejecutar el flujo completo con:

```bash
npm run refresh:gesi
```

La captura todavía **no está programada diariamente**, de acuerdo con el alcance actual. El flujo separa tres capas para poder auditar y recuperar datos:

```text
GESI (empresa 3 / sucursal 3)
       │
       ▼
data/raw/gesi-salice-latest.json       captura cruda
       │
       ▼
data/staging/snapshot-gesi.json        normalización validada
       │
       ▼
data/snapshot.json                     snapshot activo de la web
       │
       ├── data/backups/                últimos 3 snapshots recuperables
       └── data/operations.sqlite       notas y datos humanos persistentes
```

Los tres archivos de datos están ignorados por Git. La activación ocurre solamente después de validar referencias, totales, fechas, vectores y consistencia financiera.

## Criterios de negocio de esta foto

- Se conservan todos los clientes del maestro. El estado 1 de GESI define actividad; la definición empresa 3 / sucursal 3 se muestra por separado como pertenencia confirmada o a revisar.
- Los indicadores operativos, las recomendaciones y los recorridos usan exclusivamente clientes activos. La agenda de cobranzas mantiene cualquier documento abierto, incluso si el cliente pasó a inactivo.
- La facturación de 90 días se reconcilia contra los renglones positivos de producto; conceptos no asignables quedan informados por separado.
- El comportamiento de pago se calcula sólo cuando cobranza, factura y vencimiento pueden vincularse: días desde emisión, días antes/después del vencimiento y porcentaje en término.
- El saldo del cliente conserva créditos y anticipos; la agenda muestra únicamente documentos con saldo positivo.
- Como los límites de crédito llegan en cero para toda la cartera activa, la interfaz no presenta porcentajes ficticios de utilización.
- El precio de referencia prioriza el canal especializado de GESI, luego el canal general y finalmente cualquier precio positivo disponible.
- Los recorridos parten del centro de distribución de Mar del Plata, estiman distancia vial con un factor explícito y controlan duración de visita/jornada. Todavía no incorporan tránsito ni ventanas horarias.

## Alcance Salice y futura adaptación GBA

Esta solución está deliberadamente orientada a Salice. La configuración, los textos y varias decisiones operativas responden a su sucursal de Mar del Plata. Cuando se encare GBA, la opción prevista es crear una adaptación separada a partir de esta base y validar sus IDs, depósito, reglas comerciales y datos; esta versión no agrega multitenencia ni abstracciones innecesarias.

## Arquitectura

```text
React + Vite
    │
    ├── GET  /api/dashboard
    ├── GET  /api/clients/:id/recommendations
    ├── PATCH /api/clients/:id/note
    └── POST /api/routes/optimize
             │
       Express + TypeScript
        ┌────┴─────────┐
        │              │
 data/snapshot.json  operations.sqlite
        │              │
 Captura GESI       Notas y syncs
```

El snapshot JSON sigue siendo adecuado para la foto analítica monousuario; SQLite evita mezclar datos humanos con cada importación. Antes de varios vendedores conectados al mismo tiempo conviene migrar la interfaz operativa a PostgreSQL y agregar autenticación y roles.

## Verificación

```bash
npm test
npm run build
npm run audit:data
```

Las pruebas cubren similitud, compatibilidad de especie, confianza y orden de recomendaciones, exclusión de inactivos, unicidad de recorridos y alertas de jornada. Las auditorías reconcilian ventas, saldos, comprobantes, pagos contra vencimiento, pertenencia Salice, puntajes, vectores, recomendaciones y supuestos de ruta.
