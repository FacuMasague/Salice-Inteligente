# Núcleo administrativo · v0.4.0

La v0.4.0 transforma las consultas analíticas existentes en tres superficies de trabajo diario para la oficina. No reemplaza GESI ni copia información desde Power BI: combina resultados GESI auditables con una capa operativa humana persistida por separado.

## Principio de separación

| Capa | Fuente | Ejemplos | Puede editarse en Salice Inteligente |
|---|---|---|---|
| Resultado comercial | Base comercial del paquete activo, construida desde GESI | venta neta, kilos, unidades, compradores, comprobantes | No |
| Cartera documental | Base de saldos del paquete activo, construida desde GESI | pendiente, vencido, fechas, antigüedad, forma de pago | No |
| Planificación | `operations.sqlite` | versiones y filas de objetivos | Sí, sólo en borradores |
| Seguimiento humano | `operations.sqlite` | responsable, estado, próxima fecha, comentarios | Sí, con historial append-only |
| Preferencias locales | `operations.sqlite` | vistas y filtros frecuentes | Sí |

Una actualización de GESI puede reemplazar el paquete analítico, pero nunca borra el seguimiento, los objetivos ni las vistas guardadas. Los backups consistentes de `operations.sqlite` incluyen todas estas tablas.

## Explorador general de ventas

El explorador usa el contrato ejecutable `commercial-sales`: empresa 3, sucursal 3, emisor Salice y exclusiones documentadas en la ficha 002. Su fuente física es la tabla `movements` de la base comercial activa.

Filtros globales:

- emisión desde/hasta;
- vendedor;
- cliente GESI;
- producto GESI;
- marca;
- rubro;
- canal;
- zona.

Dentro de una dimensión se aplica OR y entre dimensiones se aplica AND. Los filtros recalculan una única consulta base y alimentan:

- venta neta;
- kilos y unidades netas;
- clientes compradores;
- comprobantes distintos;
- ticket promedio, definido como venta neta / comprobantes;
- venta neta por kilo, definida como venta neta / kilos netos;
- evolución diaria para ventanas de hasta 62 días o mensual para ventanas mayores;
- ranking completo vigente de clientes y productos, protegido por un tope técnico de 2.000 entidades por dimensión;
- comprobantes paginados y sus renglones exactos.

El drill-down es `indicador → período → cliente o producto → comprobante → ítem`. Una nota de crédito conserva signo negativo. Los comprobantes sin detalle no se completan artificialmente y permanecen declarados como limitación de cobertura.

Endpoints:

- `GET /api/admin/sales/meta`
- `GET /api/admin/sales`
- `GET /api/admin/sales/document?key=...`
- `GET /api/admin/sales/export?format=csv|xlsx`

## Cuentas por cobrar

El tablero toma la misma cartera documental y las mismas definiciones de Saldos Pendientes. Los filtros GESI —vendedor, forma de pago y estado vencido/a vencer— se aplican antes de unir el seguimiento humano.

La bandeja agrega:

- responsable interno libre, con sugerencias de Administración y vendedores vigentes;
- estado `Sin gestionar`, `Contactar`, `En seguimiento`, `Promesa informada`, `En revisión` o `Cerrado internamente`;
- próxima fecha de seguimiento;
- comentarios de hasta 2.000 caracteres;
- búsqueda por cliente, vendedor, responsable o comentario;
- filtros por responsable, estado interno y banda de antigüedad;
- contador de seguimientos exigibles y cuentas todavía sin gestionar.

Cada creación, cambio de responsable, cambio de estado, cambio de fecha o comentario inserta un registro nuevo en `receivable_case_events`. La aplicación no expone operaciones para editar o borrar esos eventos. `Cerrado internamente` sólo describe el flujo local: no cancela, compensa ni modifica un documento de GESI.

Endpoints:

- `GET /api/admin/receivables`
- `GET /api/admin/receivables/:clientId`
- `PATCH /api/admin/receivables/:clientId`
- `POST /api/admin/receivables/:clientId/comments`
- `GET /api/admin/receivables/export?format=csv|xlsx`

## Objetivos comerciales versionados

La migración inicial importa las 1.085 filas del plan histórico como versión 1 activa y conserva la fuente `Plan comercial Status Salice`. Los resultados reales siguen viniendo de GESI.

Reglas:

1. Sólo puede existir una versión activa.
2. Una versión activa o archivada es de sólo lectura.
3. Una nueva versión clona todas las filas de una versión elegida y nace como borrador.
4. Agregar, editar o eliminar una fila de un borrador deja un cambio auditable con actor, fecha, comentario y estado anterior/posterior.
5. La activación es explícita: archiva el plan activo anterior, calcula la cobertura real del borrador y hace que Reporte General lo use de inmediato.
6. Un borrador vacío no puede activarse.
7. Una fila debe contener al menos uno de los tres objetivos: kilos, cuentas o facturación; los valores no pueden ser negativos.

El PDF de una versión activa combina el plan con las tres lecturas reales de Reporte General. Un borrador se exporta como plan sin presentar su cumplimiento como operativo.

Endpoints:

- `GET /api/admin/goals`
- `POST /api/admin/goals/versions`
- `POST /api/admin/goals/versions/:versionId/rows`
- `PATCH /api/admin/goals/versions/:versionId/rows/:rowId`
- `DELETE /api/admin/goals/versions/:versionId/rows/:rowId`
- `POST /api/admin/goals/versions/:versionId/activate`
- `GET /api/admin/goals/export?format=xlsx|pdf`

## Vistas guardadas

Explorador de ventas y Cuentas por cobrar pueden guardar combinaciones de filtros con nombre propio. Las vistas se aíslan por superficie; marcar una como favorita sólo modifica su orden. Actualizar una vista reemplaza su combinación de filtros, no los datos de la pantalla ni los datos operativos.

Endpoints:

- `GET /api/saved-views?viewKey=sales-explorer|receivables`
- `POST /api/saved-views`
- `PATCH /api/saved-views/:id`
- `DELETE /api/saved-views/:id`

## Exportaciones

| Superficie | Formato | Grano | Trazabilidad incluida |
|---|---|---|---|
| Ventas | CSV/XLSX | renglón de comprobante-producto | generación, corte, universo y filtros |
| Cuentas por cobrar | CSV/XLSX | cliente con saldo y seguimiento | generación, corte, universo y filtros |
| Objetivos | XLSX | fila de plan | versión, estado, fuente y mes |
| Objetivos | PDF A4 | resumen del plan y cumplimiento | versión, estado, fuente real y separación GESI/plan |

Los Excel incluyen una hoja `Metadatos`. El porcentaje vencido se guarda como porcentaje numérico real, no como texto. Los CSV usan UTF-8 con BOM para abrir correctamente en Excel de escritorio.

## Persistencia y auditoría

Tablas nuevas:

- `receivable_cases`;
- `receivable_case_events`;
- `saved_views`;
- `commercial_goal_versions`;
- `commercial_goals`;
- `commercial_goal_changes`.

`pnpm run audit:platform` verifica que existan las seis tablas, que SQLite supere `integrity_check` y que exista exactamente un plan activo con filas. `pnpm run audit:operations` verifica la base operativa y sus tablas. Las pruebas de v0.4.0 reconcilian los KPI contra la consulta canónica, el saldo consolidado contra Saldos Pendientes, los renglones de comprobante, la activación de versiones, las vistas guardadas y la secuencia de eventos administrativos.

## Límite previo al multiusuario

Mientras no haya autenticación, todas las acciones de esta etapa se atribuyen a `Oficina Salice`. Esto es trazabilidad de puesto, no identidad personal. Antes de habilitar uso concurrente por varias personas deben implementarse usuarios, permisos, auditoría por identidad y una persistencia multiusuario apropiada, según la fase v0.8.x.
