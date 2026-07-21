# Inventario de reemplazo de Power BI

Este directorio registra cada archivo `.pbix` que Salice entregue durante la migración hacia Salice Inteligente. Cada ficha separa:

- propósito operativo;
- fuente y transformaciones;
- páginas, filtros y métricas;
- cifras testigo para reconciliación;
- riesgos de calidad o definiciones ambiguas;
- alcance propuesto para su reemplazo web.

Los reportes se analizan uno por uno. Antes de implementar una métrica repetida se debe revisar este inventario para evitar crear definiciones diferentes para el mismo concepto.

Los requisitos formales de retiro están en [replacement-criteria.md](replacement-criteria.md). En v0.4.0 Ventas, Reporte General y Saldos Pendientes incorporan las capacidades administrativas que faltaban para el piloto. Ningún reporte se considera retirado sin aceptación del área usuaria.

| Nº | Power BI | Tema | Estado |
|---:|---|---|---|
| 001 | Reporte SPT Vol vs mes anterior | Volumen en kilos, clientes, vendedores y comparaciones temporales | Implementado en v0.2.1 desde GESI; PBIX aislado como referencia |
| 002 | Reporte Ventas - Comercial | Venta neta, negocios, evolución, marcas y productos | Implementado desde GESI; v0.4 agrega explorador, drill-down y CSV/XLSX |
| 003 | Reporte Mars | Pet Nutrition, períodos y quarters Mars, cobertura y marcas | Implementado en v0.2.4 desde GESI; PBIX usado sólo como referencia funcional |
| 004 | Reporte NutriPet | Volumen mensual, YTD, clientes, trimestres y productos | Implementado en v0.2.5 desde GESI; cifras testigo conciliadas exactamente |
| 005 | Reporte Baires | Volumen, clientes, evolución, trimestres, marcas y subrubros | Implementado en v0.2.6 desde GESI; diferencias históricas declaradas |
| 006 | Cuentas no compradoras | Recuperación de cuentas y marcas sin compra reciente | Implementado en v0.2.7 desde GESI; ventanas y conciliación documentadas |
| 007 | Reporte Status Salice | Objetivos de kilos, estratégicas y facturación de Autoservicio | Implementado; v0.4 administra y versiona el plan separado de GESI |
| 008 | Saldos Pendientes Salice | Cartera abierta, vencimientos, plazos y ventas recientes | Implementado desde GESI; v0.4 agrega bandeja, auditoría y CSV/XLSX |
