# Criterios para considerar reemplazado un Power BI

Un reporte se considera técnicamente reemplazable sólo cuando cumple todos los criterios obligatorios. La decisión de retirarlo requiere además aceptación del área usuaria durante el piloto.

## Lista de aceptación

1. La ficha documenta propósito, responsables, universo, fuente, grano, fechas, filtros, métricas y salvedades.
2. El resultado operativo proviene de GESI o de una configuración externa explícitamente versionada; nunca del PBIX.
3. Toda métrica compartida está vinculada al catálogo central y su universo coincide con la implementación.
4. Períodos parciales y comparaciones usan cortes equivalentes o señalan claramente la excepción histórica.
5. KPI, gráficos y tablas se recalculan juntos al aplicar filtros.
6. Los totales de pantalla reconcilian internamente con sus desgloses.
7. Existen cifras testigo y pruebas reproducibles para el universo publicado.
8. Las diferencias contra Power BI quedan explicadas por corte, universo, actualización, transformación o falta de datos.
9. Las limitaciones de la API aparecen en pantalla o en la ficha; no se completan con equivalencias inventadas.
10. La vista es legible en escritorio y móvil, no presenta errores de consola y permite navegación contextual donde corresponde.
11. La actualización manual aprobada reemplaza el artefacto sin reiniciar el servidor y una falla conserva la última versión válida.
12. Administración confirma que filtros, detalle y futuras exportaciones cubren el uso cotidiano.

## Estado técnico de v0.4.0

| Reporte | Fuente operativa | Pruebas y conciliación | Limitación pendiente | Estado de retiro |
|---|---|---|---|---|
| SPT Vol vs mes anterior | GESI | Sí | Validación de uso diario | Candidato a piloto |
| Ventas · Comercial | GESI | Sí | Aceptación de uso diario del nuevo explorador | Listo para piloto funcional |
| Mars | GESI | Sí | Tipos de cliente con catálogo de respaldo | Candidato a piloto |
| NutriPet | GESI | Sí | Validación de uso diario | Candidato a piloto |
| Baires | GESI | Sí | Diferencias históricas ya declaradas | Candidato a piloto |
| Cuentas no compradoras | GESI | Sí | AcuerdosComerciales no expuesto | Uso con salvedad |
| Reporte General | GESI + plan versionado | Sí | Aceptación del flujo de borrador y activación | Listo para piloto funcional |
| Saldos Pendientes | GESI | Sí | Definir responsables reales antes del multiusuario | Listo para piloto funcional |

“Listo para piloto funcional” no significa retirado. Ningún Power BI debe apagarse hasta que el área responsable complete pruebas de uso real y acepte por escrito su reemplazo. Mientras no existan usuarios, las acciones administrativas se atribuyen al puesto `Oficina Salice`, no a una identidad personal.
