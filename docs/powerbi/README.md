# Inventario de reemplazo de Power BI

Este directorio registra cada archivo `.pbix` que Salice entregue durante la migración hacia Salice Inteligente. Cada ficha separa:

- propósito operativo;
- fuente y transformaciones;
- páginas, filtros y métricas;
- cifras testigo para reconciliación;
- riesgos de calidad o definiciones ambiguas;
- alcance propuesto para su reemplazo web.

Los reportes se analizan uno por uno. Antes de implementar una métrica repetida se debe revisar este inventario para evitar crear definiciones diferentes para el mismo concepto.

Los requisitos formales de retiro están en [replacement-criteria.md](replacement-criteria.md). En v0.4.0 Ventas, Reporte General y Saldos Pendientes incorporan las capacidades administrativas que faltaban para el piloto. Desde v0.8.0 los ocho reemplazos se encuentran reunidos en un centro que explica su finalidad, cobertura y fuente sin alterar sus contratos. En v0.8.1–v0.8.2 se unificaron filtros y contexto visible y se conectaron los hallazgos con Ventas, Cuentas por cobrar y fichas operativas, sin trasladar esas operaciones a Reportes. La v0.8.3 agrega exportaciones integrales sólo donde existe una necesidad administrativa: reutiliza Ventas, Cuentas por cobrar y Objetivos, y crea un único XLSX por SPT, Mars, NutriPet, Baires o vista filtrada de Cuentas no compradoras. La v0.8.4 incorpora una portada “¿Cómo estamos?” que compone los contratos aceptados sin sumar universos incompatibles; la v0.8.5 quita Inventario de esa lectura breve, traslada la consulta libre de fojas a Reportes y corrige desbordes, jerarquía de acciones y formatos Excel. La v0.8.6 simplifica los filtros de SPT, unifica la experiencia visual de los tres negocios de marca, conecta Reporte General con Objetivos y deja Saldos Pendientes como resumen, con la gestión por cliente en Cuentas por cobrar. Las advertencias se retiraron sólo de las tarjetas de acceso: continúan dentro del reporte correspondiente. Ningún reporte se considera retirado sin aceptación del área usuaria.

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
