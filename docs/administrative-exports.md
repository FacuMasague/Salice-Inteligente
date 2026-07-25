# Matriz de exportaciones administrativas · v0.8.3

La v0.8.3 extiende las exportaciones prioritarias del núcleo administrativo a los reportes que realmente requieren un archivo fuera del sistema, sin crear una descarga por cada gráfico.

| Prioridad | Vista | Formato inicial | Grano | Estado v0.4.0 | Motivo |
|---:|---|---|---|---|---|
| 1 | Cuentas por cobrar | XLSX/CSV | Cliente con saldo y seguimiento | Implementado | Gestión y conciliación administrativa |
| 1 | Explorador de ventas | XLSX/CSV | Renglón de comprobante-producto | Implementado | Análisis y control comercial |
| 1 | Agenda | XLSX/CSV | Tarea o gestión | Pendiente | Seguimiento operativo |
| 2 | Cuentas no compradoras | XLSX | Cliente o marca | Implementado v0.8.3 | Recuperación con vista, estado y búsqueda activos |
| 2 | Objetivos y cumplimiento | XLSX/PDF | Lectura-mes-dimensión | Implementado | Reuniones y trazabilidad del plan |
| 2 | Comprobante individual | PDF | Encabezado y renglón de producto disponible | Implementado v0.4.3 | Consulta y archivo administrativo |
| 3 | SPT, Mars, NutriPet y Baires | XLSX | Informe completo filtrado | Implementado v0.8.3 | Análisis y control sin fragmentar cada gráfico |

Reglas para todas las exportaciones:

- incluir título, fecha y hora de generación, período, corte del dato, universo, filtros, fuente y advertencias;
- usar exactamente las métricas del catálogo central;
- distinguir resultado GESI de objetivo o configuración externa;
- no exportar secretos ni campos personales que la tarea no necesite;
- CSV/XLSX conserva datos de detalle; PDF se reserva para una presentación estable y resumida;
- el total exportado debe reconciliar con la vista filtrada antes de habilitar la descarga.

Implementación vigente:

- los CSV usan UTF-8 con BOM y separan metadatos del encabezado de datos;
- los XLSX poseen hoja `Metadatos`, autofiltro, anchos y formatos numéricos;
- desde v0.8.5, todas las tablas congelan el encabezado, reservan anchos suficientes para fechas, importes y cantidades, y evitan los anchos predeterminados que podían mostrar `######`;
- desde v0.8.6, las hojas mantienen visibles las líneas de cuadrícula de Excel para facilitar su lectura y revisión en oficina;
- fechas y porcentajes se guardan como valores tipados de Excel; los porcentajes usan fracciones numéricas con formato porcentual;
- las cantidades e importes siguen siendo celdas numéricas y usan formatos compatibles con la convención argentina;
- los nuevos reportes generan un libro integral con resumen y todos sus desgloses completos;
- Ventas Comercial, Saldos Pendientes y Reporte General no duplican exportadores: reutilizan Explorador de ventas, Cuentas por cobrar y Objetivos, respectivamente;
- Cuentas no compradoras aplica búsqueda y estado al universo completo antes de escribir el archivo, sin el límite visual de 100 filas;
- el porcentaje vencido se escribe como fracción numérica compatible con Excel;
- el PDF de objetivos usa A4 y distingue plan activo de borrador;
- el PDF de comprobante usa A4, identifica corte, cliente, vendedor, forma de pago, importes y detalle disponible; si GESI omitió renglones, lo declara en lugar de completarlos;
- las exportaciones fueron abiertas y verificadas como archivos válidos durante el cierre de v0.4.0.
