# Salice Inteligente v0.6.4 · Objetivos y seguimiento simple

## Objetivo

Relacionar objetivos versionados con resultados reales de GESI y señales humanas simples, manteniendo separados plan, resultado y actividad registrada.

## Alcance

- Cualquier versión seleccionada —activa, borrador o histórica— se calcula contra el mismo resultado real del mes.
- Se resumen objetivos generales en kilos, marcas estratégicas y facturación de autoservicio.
- Por vendedor se muestran objetivo, resultado, diferencia, avance, clientes con notas, notas y clientes con O alta.
- El Reporte General continúa usando únicamente el plan activo. La comparación administrativa puede inyectar una versión explícita sin modificarlo.

## Contratos y fuentes

- Objetivos: `commercial_goal_versions` y `commercial_goals`, con fuente, cobertura e historial ya versionados.
- Resultados: base analítica construida desde movimientos GESI y universo documentado del Reporte General.
- Actividad: `commercial_activities`, creada sólo por una acción humana.
- Oportunidad alta: señal O actual de clientes comercialmente elegibles.

## Límites

Las notas no prueban contacto ni productividad. O no es probabilidad de compra ni etapa comercial. No se agregó un embudo; sus etapas quedan suspendidas hasta contar con una necesidad comprobada y definiciones aceptadas por Salice.

La versión no incorpora comunicaciones, móvil, multitenencia, hosting, actualización nocturna ni cambios del tutorial.

## Validación

- 179 pruebas aprobadas, 7 conciliaciones históricas omitidas explícitamente y 0 fallas.
- Build de TypeScript y Vite correcto.
- Integridad de `operations.sqlite` correcta sobre 20 tablas.
- Auditoría de plataforma: 23 controles obligatorios aprobados, 0 fallas y 5 advertencias conocidas de GESI.
- Auditorías de datos, vectores y precios aprobadas.
- Revisión visual de Oportunidades, Objetivos y Vendedores sin errores del servidor ni desbordes propios de las nuevas superficies.
