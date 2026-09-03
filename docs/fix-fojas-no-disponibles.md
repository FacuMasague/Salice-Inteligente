# Actualización interrumpida por una foja no disponible (2026-09-03)

Sobre main 6ad9689. Render bloqueó la captura al no encontrar la foja 15051 en el listado y recibir HTTP 400 en GetItem. El último paquete aprobado del 2 de septiembre conservaba la foja abierta con diez comprobantes. No existe evidencia para declararla cerrada o entregada.

La recuperación anterior sólo admitía fojas cerradas y clasificaba cualquier HTTP 400/404 como baja. Ahora se requieren tres respuestas HTTP 400 con código GESI 4041, renovando autenticación entre consultas, después de un listado completo y sólo con histórico de un paquete aprobado. Esta evidencia indica indisponibilidad, no eliminación. Otros errores y detalles incompletos siguen bloqueando.

Se conserva el detalle anterior con fechas de última verificación y comprobación de indisponibilidad. Sus asociaciones se excluyen de las asignaciones actuales y de los conteos de fojas abiertas/cerradas. La interfaz presenta el histórico por separado. Una factura queda con estado desconocido salvo que una foja actual o el endpoint explícito de no asignados confirme su situación. La derivación por diferencia excluye también las asociaciones históricas para no inventar desasignaciones. Al reaparecer un detalle válido se elimina la marca histórica.

Las consultas de diagnóstico fueron de sólo lectura. Facturas/GetItem devolvió fojaID null tanto para los diez comprobantes afectados como para un control con foja existente; ese campo no se utiliza como prueba de desasignación. No se alteran valores comerciales, cierres, entregas ni el alcance empresa 3 / sucursal 3 / almacén 2.

Pruebas: errores tipados del cliente, tres confirmaciones, rechazo de errores ambiguos y detalles incorrectos, recuperación posterior, conservación de historial y precedencia de asignaciones vigentes. La publicación y la actualización completa de producción requieren un paso posterior; no fueron ejecutadas como parte del diagnóstico.

Verificación final: 429 pruebas aprobadas y 7 históricas omitidas; TypeScript y build Vite correctos; git diff --check sin errores. Aviso histórico y detalle revisados con datos ficticios en escritorio y móvil (390 px). Los primeros intentos tuvieron demoras de lectura de dependencias locales; la suite completa pasó luego sin modificar autenticación ni ampliar timeouts.
