# Matriz de exportaciones administrativas · v0.4.3

La v0.4.0 implementa las exportaciones prioritarias del núcleo administrativo y conserva el resto como backlog explícito.

| Prioridad | Vista | Formato inicial | Grano | Estado v0.4.0 | Motivo |
|---:|---|---|---|---|---|
| 1 | Cuentas por cobrar | XLSX/CSV | Cliente con saldo y seguimiento | Implementado | Gestión y conciliación administrativa |
| 1 | Explorador de ventas | XLSX/CSV | Renglón de comprobante-producto | Implementado | Análisis y control comercial |
| 1 | Agenda | XLSX/CSV | Tarea o gestión | Pendiente | Seguimiento operativo |
| 2 | Cuentas no compradoras | XLSX/CSV | Cliente o marca | Pendiente | Campañas de recuperación |
| 2 | Objetivos y cumplimiento | XLSX/PDF | Lectura-mes-dimensión | Implementado | Reuniones y trazabilidad del plan |
| 2 | Comprobante individual | PDF | Encabezado y renglón de producto disponible | Implementado v0.4.3 | Consulta y archivo administrativo |
| 3 | Reportes de proveedor | XLSX/PDF | Marca-producto-período | Pendiente | Intercambio externo controlado |

Reglas para todas las exportaciones:

- incluir fecha de generación, corte del dato, universo y filtros;
- usar exactamente las métricas del catálogo central;
- distinguir resultado GESI de objetivo o configuración externa;
- no exportar secretos ni campos personales que la tarea no necesite;
- CSV/XLSX conserva datos de detalle; PDF se reserva para una presentación estable y resumida;
- el total exportado debe reconciliar con la vista filtrada antes de habilitar la descarga.

Implementación vigente:

- los CSV usan UTF-8 con BOM y separan metadatos del encabezado de datos;
- los XLSX poseen hoja `Metadatos`, autofiltro, anchos y formatos numéricos;
- el porcentaje vencido se escribe como fracción numérica compatible con Excel;
- el PDF de objetivos usa A4 y distingue plan activo de borrador;
- el PDF de comprobante usa A4, identifica corte, cliente, vendedor, forma de pago, importes y detalle disponible; si GESI omitió renglones, lo declara en lugar de completarlos;
- las exportaciones fueron abiertas y verificadas como archivos válidos durante el cierre de v0.4.0.
